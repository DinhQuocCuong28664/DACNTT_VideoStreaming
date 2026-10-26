# -*- coding: utf-8 -*-
"""
Package backend into a lightweight zip for AWS Lambda.
Excludes devDependencies, test files, markdown, git, and caches.
"""
import os
import sys
import zipfile

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

def package_lambda():
    backend_dir = os.path.abspath("backend")
    output_dir = os.path.abspath("infrastructure/modules/lambda-backend/dist")
    os.makedirs(output_dir, exist_ok=True)
    zip_path = os.path.join(output_dir, "backend_api.zip")

    print(f"📦 Packaging Lambda backend from: {backend_dir}")
    print(f"📦 Target zip: {zip_path}")

    # Files and directories to exclude
    exclude_dirs = {
        ".git", "tests", ".cache", "__pycache__", "coverage", ".vscode", ".idea"
    }
    exclude_extensions = {
        ".test.js", ".spec.js", ".md", ".map", ".ts", ".png", ".jpg", ".jpeg"
    }

    file_count = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zip_file:
        for root, dirs, files in os.walk(backend_dir):
            # Prune excluded directories
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            
            # Avoid node_modules/.bin
            if ".bin" in root.split(os.sep):
                continue

            for file in files:
                if any(file.endswith(ext) for ext in exclude_extensions) and not file.endswith(".json") and not file.endswith(".js"):
                    continue
                if file in {".env", ".env.example", ".gitignore", "jest.config.js"}:
                    continue

                abs_path = os.path.join(root, file)
                rel_path = os.path.relpath(abs_path, backend_dir)
                
                # Convert windows backslashes to forward slashes for zip/linux compatibility
                archive_name = rel_path.replace("\\", "/")
                
                zip_file.write(abs_path, archive_name)
                file_count += 1

    size_mb = os.path.getsize(zip_path) / (1024 * 1024)
    print(f"✅ Packaged {file_count} files into {zip_path}")
    print(f"📊 Final zip size: {size_mb:.2f} MB")
    return zip_path

if __name__ == "__main__":
    package_lambda()
