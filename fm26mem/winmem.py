"""Read-only access to another process's memory on Windows (64-bit), via ctypes.

Only PROCESS_QUERY_INFORMATION | PROCESS_VM_READ are requested, so nothing here
can modify the target process or its data.
"""
import ctypes
import ctypes.wintypes as wt

import numpy as np

PROCESS_QUERY_INFORMATION = 0x0400
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
PROCESS_VM_READ = 0x0010
MEM_COMMIT = 0x1000
MEM_PRIVATE, MEM_MAPPED, MEM_IMAGE = 0x20000, 0x40000, 0x1000000
PAGE_NOACCESS, PAGE_GUARD = 0x01, 0x100
PAGE_READONLY, PAGE_READWRITE, PAGE_EXECUTE_READWRITE = 0x02, 0x04, 0x40

TH32CS_SNAPPROCESS = 0x00000002
TH32CS_SNAPMODULE = 0x00000008
TH32CS_SNAPMODULE32 = 0x00000010
INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value

_k32 = ctypes.WinDLL('kernel32', use_last_error=True)


class MBI(ctypes.Structure):
    _fields_ = [('BaseAddress', ctypes.c_void_p), ('AllocationBase', ctypes.c_void_p),
                ('AllocationProtect', wt.DWORD), ('PartitionId', wt.WORD),
                ('RegionSize', ctypes.c_size_t), ('State', wt.DWORD),
                ('Protect', wt.DWORD), ('Type', wt.DWORD)]


class PROCESSENTRY32W(ctypes.Structure):
    _fields_ = [('dwSize', wt.DWORD), ('cntUsage', wt.DWORD), ('th32ProcessID', wt.DWORD),
                ('th32DefaultHeapID', ctypes.c_size_t), ('th32ModuleID', wt.DWORD),
                ('cntThreads', wt.DWORD), ('th32ParentProcessID', wt.DWORD),
                ('pcPriClassBase', ctypes.c_long), ('dwFlags', wt.DWORD),
                ('szExeFile', ctypes.c_wchar * 260)]


class MODULEENTRY32W(ctypes.Structure):
    _fields_ = [('dwSize', wt.DWORD), ('th32ModuleID', wt.DWORD), ('th32ProcessID', wt.DWORD),
                ('GlblcntUsage', wt.DWORD), ('ProccntUsage', wt.DWORD),
                ('modBaseAddr', ctypes.c_void_p), ('modBaseSize', wt.DWORD),
                ('hModule', ctypes.c_void_p), ('szModule', ctypes.c_wchar * 256),
                ('szExePath', ctypes.c_wchar * 260)]


_k32.OpenProcess.restype = wt.HANDLE
_k32.OpenProcess.argtypes = [wt.DWORD, wt.BOOL, wt.DWORD]
_k32.CloseHandle.argtypes = [wt.HANDLE]
_k32.ReadProcessMemory.restype = wt.BOOL
_k32.ReadProcessMemory.argtypes = [wt.HANDLE, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t,
                                   ctypes.POINTER(ctypes.c_size_t)]
_k32.VirtualQueryEx.restype = ctypes.c_size_t
_k32.VirtualQueryEx.argtypes = [wt.HANDLE, ctypes.c_void_p, ctypes.POINTER(MBI), ctypes.c_size_t]
_k32.CreateToolhelp32Snapshot.restype = wt.HANDLE
_k32.CreateToolhelp32Snapshot.argtypes = [wt.DWORD, wt.DWORD]
_k32.Process32FirstW.argtypes = [wt.HANDLE, ctypes.POINTER(PROCESSENTRY32W)]
_k32.Process32NextW.argtypes = [wt.HANDLE, ctypes.POINTER(PROCESSENTRY32W)]
_k32.Module32FirstW.argtypes = [wt.HANDLE, ctypes.POINTER(MODULEENTRY32W)]
_k32.Module32NextW.argtypes = [wt.HANDLE, ctypes.POINTER(MODULEENTRY32W)]
_k32.QueryFullProcessImageNameW.restype = wt.BOOL
_k32.QueryFullProcessImageNameW.argtypes = [wt.HANDLE, wt.DWORD, wt.LPWSTR, ctypes.POINTER(wt.DWORD)]


def process_image_path(pid):
    """Full path of a process's .exe ('' if it can't be queried)."""
    h = _k32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not h:
        return ''
    try:
        buf = ctypes.create_unicode_buffer(1024)
        size = wt.DWORD(len(buf))
        return buf.value if _k32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size)) else ''
    finally:
        _k32.CloseHandle(h)


def find_pids(exe_name):
    """PIDs of running processes whose image name matches (case-insensitive)."""
    snap = _k32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    pids = []
    if snap in (None, INVALID_HANDLE_VALUE):
        return pids
    try:
        pe = PROCESSENTRY32W()
        pe.dwSize = ctypes.sizeof(pe)
        ok = _k32.Process32FirstW(snap, ctypes.byref(pe))
        while ok:
            if pe.szExeFile.lower() == exe_name.lower():
                pids.append(pe.th32ProcessID)
            ok = _k32.Process32NextW(snap, ctypes.byref(pe))
    finally:
        _k32.CloseHandle(snap)
    return pids


class Process:
    """A process opened for reading memory."""

    def __init__(self, pid):
        self.pid = pid
        self.handle = _k32.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, False, pid)
        if not self.handle:
            err = ctypes.get_last_error()
            if err == 5:
                raise OSError('Windows denied access to the game process. If Football Manager is running '
                              'as administrator, start FM27Plus.exe as administrator too.')
            raise OSError('Could not open the game process (Windows error %d).' % err)

    def close(self):
        if self.handle:
            _k32.CloseHandle(self.handle)
            self.handle = None

    def modules(self):
        """{lower-case module name: (base, size)}"""
        out = {}
        snap = _k32.CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, self.pid)
        if snap in (None, INVALID_HANDLE_VALUE):
            return out
        try:
            me = MODULEENTRY32W()
            me.dwSize = ctypes.sizeof(me)
            ok = _k32.Module32FirstW(snap, ctypes.byref(me))
            while ok:
                out[me.szModule.lower()] = (me.modBaseAddr or 0, me.modBaseSize)
                ok = _k32.Module32NextW(snap, ctypes.byref(me))
        finally:
            _k32.CloseHandle(snap)
        return out

    def regions(self, types=(MEM_PRIVATE, MEM_MAPPED), writable_only=True, min_size=0):
        """Committed, readable regions as (base, size, protect, type)."""
        out = []
        addr = 0
        mbi = MBI()
        limit = 0x7FFFFFFF0000
        while addr < limit:
            if not _k32.VirtualQueryEx(self.handle, ctypes.c_void_p(addr), ctypes.byref(mbi), ctypes.sizeof(mbi)):
                break
            base = mbi.BaseAddress or 0
            size = mbi.RegionSize
            prot = mbi.Protect
            if (mbi.State == MEM_COMMIT and prot != 0 and not (prot & (PAGE_NOACCESS | PAGE_GUARD))
                    and mbi.Type in types and size >= min_size):
                if not writable_only or (prot & (PAGE_READWRITE | PAGE_EXECUTE_READWRITE)):
                    out.append((base, size, prot, mbi.Type))
            nxt = base + size
            if nxt <= addr:
                break
            addr = nxt
        return out

    def read(self, addr, size):
        """uint8 array of the bytes actually read (possibly shorter), or None."""
        buf = np.empty(size, dtype=np.uint8)
        got = ctypes.c_size_t(0)
        ok = _k32.ReadProcessMemory(self.handle, ctypes.c_void_p(addr), buf.ctypes.data, size, ctypes.byref(got))
        if not ok and got.value == 0:
            return None
        return buf[:got.value]

    def read_bytes(self, addr, size):
        arr = self.read(addr, size)
        return None if arr is None else arr.tobytes()

    def read_exact(self, addr, size):
        arr = self.read(addr, size)
        if arr is None or len(arr) != size:
            return None
        return arr
