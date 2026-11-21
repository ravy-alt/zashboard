"""Validate the seven deployable dashboard archives before updating latest."""

import hashlib
from pathlib import Path
import sys
from zipfile import ZipFile

directory = Path(sys.argv[1])
expected = {
    f"dist{suffix}.zip"
    for suffix in (
        "", "-cdn-fonts", "-firasans-only", "-misans-only",
        "-pingfang-only", "-sarasa-only", "-no-fonts",
    )
}
actual = {path.name for path in directory.iterdir()}
if actual != expected:
    raise SystemExit(f"Missing: {sorted(expected - actual)}; unexpected: {sorted(actual - expected)}")

checksums = []
for name in sorted(expected):
    path = directory / name
    with ZipFile(path) as archive:
        names = archive.namelist()
        if "dist/index.html" not in names or "dist/LICENSE" not in names:
            raise SystemExit(f"Incomplete dashboard archive: {name}")
        if any(not item.startswith("dist/") or ".." in Path(item).parts for item in names):
            raise SystemExit(f"Invalid dashboard archive layout: {name}")
        if not archive.read("dist/index.html") or archive.testzip() is not None:
            raise SystemExit(f"Invalid dashboard archive contents: {name}")
    with path.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    checksums.append(f"{digest}  {name}\n")
(directory / "SHA256SUMS").write_text("".join(checksums))
print("Verified all seven dashboard archives; generated SHA256SUMS")
