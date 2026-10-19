#!/usr/bin/env python3
"""Fail Friends preparation if the staged site lacks its authored packages."""
import base64
import gzip
import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SELECTED = {"science", "sports"}
STORIES = {
    "venue-map": "packages/sports/examples/venue-map.spec.json",
    "sequencing-walkthrough": "packages/science/starters/sequencing-walkthrough.json",
    "biology-teaching": "packages/science/diagrams/biology/cell-journey/biology-teaching.spec.json",
    "season-of-seats": "packages/sports/diagrams/season-of-seats/season-of-seats.spec.json",
    "waves-and-forces": "packages/science/diagrams/physics/waves-and-forces/waves-and-forces.spec.json",
    "copy-gate": "packages/science/diagrams/biology/copy-gate/copy-gate.spec.json",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def embedded_kit(html):
    match = re.search(
        r'<script type="application/json" id="flowview-folder-kit">(.*?)</script>',
        html, re.S)
    require(match is not None, "Workbench has no folder-agent kit")
    envelope = json.loads(match.group(1))
    raw = gzip.decompress(base64.b64decode(envelope["gzip"], validate=True))
    require(hashlib.sha256(raw).hexdigest() == envelope["sha256"],
            "Folder-agent kit digest differs from embedded bytes")
    return json.loads(raw)["files"]


def embedded_templates(html):
    match = re.search(r'^var WORKBENCH_TEMPLATES = (.*);$', html, re.M)
    require(match is not None, "Workbench has no built-in starter catalog")
    return json.loads(match.group(1))


def source_names(text):
    return set(re.findall(r'/\* ---- packages/([^/]+)/', text))


def main(stage):
    stage = pathlib.Path(stage).resolve()
    generated = (ROOT / "workbench/flowspec.html").read_bytes()
    workbench = (stage / "workbench/flowspec.html").read_bytes()
    require(workbench == generated, "Staged workbench differs from selected-package build")
    standalone = (stage / "template/flowview.html").read_bytes()
    require(standalone == (ROOT / "template/flowview.html").read_bytes(),
            "Staged viewer differs from selected-package build")
    html = workbench.decode("utf-8")
    viewer = standalone.decode("utf-8")
    kit = embedded_kit(html)
    require(set(json.loads(kit["tools/enabled-packages.json"])) == SELECTED,
            "Folder-agent kit has the wrong package selection")
    require({key.split("/")[1] for key in kit if key.startswith("packages/")} == SELECTED,
            "Folder-agent kit includes an unselected package or omits a selected one")
    contract = kit["contract/authoring-contract.md"]
    for name in SELECTED:
        prefix = f"packages/{name}/"
        manifest = json.loads((ROOT / prefix / "package.json").read_text())
        require(kit[prefix + "package.json"] == (ROOT / prefix / "package.json").read_text(),
                f"{name} manifest differs in downloaded authoring kit")
        require(f"<!-- {prefix}contract.md -->" in contract,
                f"{name} panel contract is absent from combined authoring contract")
        for relative in ["contract.md", *manifest.get("routes", {}).values()]:
            for file in [relative] if isinstance(relative, str) else relative:
                path = prefix + file
                require(kit.get(path) == (ROOT / path).read_text(),
                        f"{name} recipe or contract is missing from authoring kit: {path}")
        for file in manifest["sourceFiles"]:
            marker = f"/* ---- {prefix}{file} ---- */"
            require(marker in html and marker in viewer and marker in kit["tools/canon/generated-runtime.cjs"],
                    f"{name} panel source is missing from a generated runtime: {file}")
        for file in manifest.get("workbenchSourceFiles", []):
            require(f"/* ---- {prefix}{file} ---- */" in html,
                    f"{name} editor source is missing: {file}")

    for surface, text in [("workbench", html), ("viewer", viewer),
                          ("kit runtime", kit["tools/canon/generated-runtime.cjs"])]:
        require(source_names(text) == SELECTED,
                f"{surface} has missing or unselected package panel source")

    # Built-in science starters are serialized into the same HTML that is
    # staged for upload. Sports has no built-in starter; its reviewed stories
    # are published in Canon and in the hosted Friends starter manifest.
    sys.path.insert(0, str(ROOT / "tools"))
    import build  # pylint: disable=import-outside-toplevel
    expected_templates = json.loads(build.workbench_templates())
    templates = embedded_templates(html)
    require(templates == expected_templates, "Staged built-in starter catalog differs from selected build")
    expected_names = [entry["name"] for entry in build.WORKBENCH_TEMPLATES]
    for name in ("science", "sports"):
        manifest = json.loads((ROOT / "packages" / name / "package.json").read_text())
        expected_names.extend(entry["name"] for entry in manifest.get("templates", []))
        for source in manifest.get("templates", []):
            require(any(entry["name"] == source["name"] for entry in templates),
                    f"{name} built-in starter is missing: {source['name']}")
    require([entry["name"] for entry in templates] == expected_names,
            "Starter catalog has missing or unselected package templates")

    index = json.loads((stage / "workbench/diagrams.json").read_text())
    require((stage / "workbench/diagrams.json").read_bytes() ==
            (ROOT / "workbench/diagrams.json").read_bytes(),
            "Staged Canon index differs from selected build")
    require({entry["id"] for entry in index["diagrams"]} == set(STORIES) and
            len(index["diagrams"]) == len(STORIES), "Canon index does not contain exactly six Friends stories")
    hosted = json.loads((stage / "workbench/starters.json").read_text())
    require(len(hosted) == len(STORIES), "Hosted starter manifest omits a Friends story")
    for slug, package_path in STORIES.items():
        source = (ROOT / package_path).read_text()
        friend = stage / "diagrams/friends" / slug / f"{slug}.spec.json"
        require(friend.read_text() == source, f"Staged {slug} differs from reviewed package story")
        require(kit.get(package_path) == source, f"Downloaded authoring kit omits reviewed {slug} story")
        spec = json.loads(source)
        require(sum(entry["spec"] == spec and entry["name"] == spec["page"]["title"]
                    for entry in hosted) == 1,
                f"Hosted starter manifest does not expose editable {slug} story")

    print("Verified staged Friends workbench: science and sports panels, contracts, recipes, "
          "built-in and hosted starters, six Canon stories, and selected-only authoring kit")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python3 company/verify-friends-bundle.py STAGED_SITE")
        main(sys.argv[1])
    except (OSError, KeyError, ValueError, TypeError, IndexError) as error:
        print(f"Friends bundle verification failed: {error}", file=sys.stderr)
        sys.exit(1)
