"""Rewrites a GitHub Release's notes to hyperlink each installer asset
directly (instead of listing bare filenames), so a visitor to the release
page can click straight through to a download with no extra navigation.

Run by .github/workflows/build.yml's release-notes job, after all three
platform builds have published their assets to the tag's release.
"""

import json
import os
import subprocess


def main():
    repo = os.environ["REPO"]
    tag = os.environ["TAG"]
    base = f"https://github.com/{repo}/releases/download/{tag}"

    out = subprocess.run(
        ["gh", "release", "view", tag, "--repo", repo, "--json", "assets"],
        capture_output=True, text=True, check=True,
    )
    assets = [a["name"] for a in json.loads(out.stdout)["assets"]]

    # Skip auto-update metadata files - not meant for direct download.
    assets = [a for a in assets if not a.endswith((".blockmap", ".yml"))]

    def find(pred):
        return next((a for a in assets if pred(a)), None)

    win = find(lambda a: a.endswith(".exe"))
    mac_arm = find(lambda a: a.endswith(".dmg") and "arm64" in a)
    mac_intel = find(lambda a: a.endswith(".dmg") and "arm64" not in a)
    appimage = find(lambda a: a.endswith(".AppImage"))
    deb = find(lambda a: a.endswith(".deb"))

    def link(name):
        return f"[`{name}`]({base}/{name})" if name else None

    lines = [
        f"NeonModoro {tag.lstrip('v')}.",
        "",
    ]
    if win:
        lines.append(f"- Windows: {link(win)}")
    if mac_arm:
        lines.append(f"- macOS (Apple Silicon): {link(mac_arm)}")
    if mac_intel:
        lines.append(f"- macOS (Intel): {link(mac_intel)}")
    linux_bits = [b for b in (link(appimage), link(deb)) if b]
    if linux_bits:
        lines.append(f"- Linux: {' or '.join(linux_bits)}")
    lines += [
        "",
        f"See the [README](https://github.com/{repo}#readme) for first-run "
        "notes on Windows SmartScreen and macOS Gatekeeper warnings.",
    ]

    subprocess.run(
        ["gh", "release", "edit", tag, "--repo", repo, "--notes", "\n".join(lines)],
        check=True,
    )


if __name__ == "__main__":
    main()
