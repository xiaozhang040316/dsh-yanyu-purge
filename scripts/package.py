"""Build a verified ZIP from the actual npm package, plus SHA-256 checksums."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import tarfile
import zipfile

root = Path(__file__).resolve().parent.parent
subprocess.run(['node', 'scripts/check.mjs'], cwd=root, check=True)
out = root / 'dist'
out.mkdir(exist_ok=True)
result = subprocess.run([shutil.which('npm') or 'npm', 'pack', '--json', '--pack-destination', str(out)], cwd=root, text=True, capture_output=True, check=True, encoding='utf-8')
data = json.loads(result.stdout)[0]
tgz = out / data['filename']
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
zip_path = out / f'dsh-yanyu-purge-v{version}.zip'
with tarfile.open(tgz, 'r:gz') as archive, zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipped:
    names = []
    for entry in archive.getmembers():
        if not entry.isfile():
            continue
        name = entry.name.removeprefix('package/')
        if entry.name == name or '..' in Path(name).parts:
            raise ValueError('Unexpected package path')
        content = archive.extractfile(entry).read()
        zipped.writestr('dsh-yanyu-purge/' + name, content)
        names.append(name)
    assert all(name in names for name in ['package.json', 'index.js', 'client.js', 'icon.svg', 'cordis.patch.yml', 'LICENSE', 'docs/INSTALL.md'])
    assert len([name for name in names if name.startswith('prompts/')]) == 4
with zipfile.ZipFile(zip_path) as zipped:
    assert zipped.testzip() is None
    for name in names:
        assert zipped.read('dsh-yanyu-purge/' + name) == (root / name).read_bytes()
files = [zip_path, tgz]
(out / 'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(file.read_bytes()).hexdigest() + '  ' + file.name + '\n' for file in files), encoding='utf-8')
print(f'PACKAGE PASS: {len(names)} files, ZIP contents match source, SHA256SUMS.txt written')
for file in files:
    print(file.name, file.stat().st_size)
