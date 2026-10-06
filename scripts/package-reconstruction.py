"""Create and independently reopen/extract a conventional, complete source ZIP.

Usage: python scripts/package-reconstruction.py PROJECT ZIP_PATH VERIFY_DIRECTORY
No secrets, build output, dependencies, other archives, or symlink targets are packaged.
"""
from pathlib import Path
import hashlib
import json
import shutil
import struct
import sys
import unicodedata
import zipfile

project, archive, verification = map(lambda s: Path(s).resolve(), sys.argv[1:4])
excluded_dirs = {"node_modules", ".next", ".git", "test-artifacts", "__pycache__"}


def included(path):
    parts = path.relative_to(project).parts
    if any(part in excluded_dirs for part in parts):
        return False
    if path.is_symlink():
        return False
    if path.name.startswith(".env") and path.name != ".env.example":
        return False
    return path.suffix not in {".zip", ".tgz", ".tsbuildinfo", ".pyc"}


files = sorted(p for p in project.rglob("*") if p.is_file() and included(p))
assert files and archive not in files
names = ["hair-style-ai/" + p.relative_to(project).as_posix() for p in files]
assert len(names) == len(set(names))
assert len(names) == len({unicodedata.normalize("NFC", n).casefold() for n in names})
archive.parent.mkdir(parents=True, exist_ok=True)
manifest = {name: hashlib.sha256(p.read_bytes()).hexdigest() for name, p in zip(names, files)}

with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED,
                     compresslevel=9, allowZip64=False, strict_timestamps=False) as z:
    for name, p in zip(names, files):
        info = zipfile.ZipInfo(name, (2026, 10, 4, 0, 0, 0))
        info.create_system = 0  # DOS metadata; no Unix symlink attributes.
        info.external_attr = 0x20
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, p.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

data = archive.read_bytes()
eocd_offset = data.rfind(b"PK\x05\x06", max(0, len(data) - 65557))
assert eocd_offset >= 0
signature, disk, directory_disk, disk_count, count, directory_size, directory_offset, comment = struct.unpack_from("<4s4H2LH", data, eocd_offset)
assert disk == directory_disk == 0 and disk_count == count == len(files)
assert directory_offset + directory_size == eocd_offset
assert eocd_offset + 22 + comment == len(data)
assert data[directory_offset:directory_offset + 4] == b"PK\x01\x02"

verification.mkdir(parents=True, exist_ok=True)
extracted = verification / "trial-extraction"
if extracted.exists():
    shutil.rmtree(extracted)
extracted.mkdir()
with zipfile.ZipFile(archive) as z:
    assert z.namelist() == names
    assert z.testzip() is None
    for info in z.infolist():
        assert not info.flag_bits & 1
        assert info.compress_type == zipfile.ZIP_DEFLATED
        assert ".." not in Path(info.filename).parts and not info.filename.startswith("/")
        assert hashlib.sha256(z.read(info)).hexdigest() == manifest[info.filename]
    z.extractall(extracted)

expanded_files = sorted(p for p in extracted.rglob("*") if p.is_file())
assert len(expanded_files) == len(files)
for p in expanded_files:
    assert hashlib.sha256(p.read_bytes()).hexdigest() == manifest[p.relative_to(extracted).as_posix()]
with zipfile.ZipFile(archive) as reopened:
    assert len(reopened.infolist()) == count
    assert reopened.testzip() is None

result = {"filename": archive.name, "sizeBytes": len(data), "sizeMiB": round(len(data) / 1048576, 3),
          "sha256": hashlib.sha256(data).hexdigest(), "fileCount": count,
          "centralDirectory": "PASS", "centralDirectoryOffset": directory_offset,
          "centralDirectorySize": directory_size, "EOCD": "PASS", "EOCDOffset": eocd_offset,
          "CRC": "PASS_ALL_FILES", "trialExtraction": "PASS_ALL_FILES_AND_SHA256",
          "reopen": "PASS_LIST_AND_CRC", "expandedFileCount": len(expanded_files),
          "ZIP64": False, "encryption": False, "splitArchive": False,
          "compression": "DEFLATE", "physicalIPadFilesApp": "UNVERIFIED"}
(verification / "zip-validation.json").write_text(json.dumps(result, indent=2) + "\n")
(verification / "archive-file-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(result, indent=2))
