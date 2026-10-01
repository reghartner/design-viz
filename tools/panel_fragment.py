"""Focused device-app presentation fragments (v1).

Pure, deterministic checks used by ``folder-agent.py assemble-deviceapp``.
Nothing here reads files, runs processes or touches the network. The browser
module src/workbench/focused-panel.js writes the immutable task packet; this
module re-derives the same fragment from the identity-bound full source,
enforces the presentation allowlist and merges only the selected panel's keys
into a complete candidate. Keep ``problems`` in step with
``focusedPanelProblems`` in the JS module.
"""
import collections
import copy
import hashlib
import json
import re

MODE = 'focused-deviceapp'
PACKET_FORMAT = 'flowview-deviceapp-focus-v1'
FRAGMENT_FORMAT = 'flowview-deviceapp-presentation-v1'
PACKET_LIMIT = 1024 * 1024
FRAGMENT_LIMIT = 2 * 1024 * 1024
PATCH_KEYS = ('phoneScreen', 'clock', 'date', 'note', 'notify', 'clear')
FIELD_KEYS = ('value', 'status', 'source', 'detail', 'visible', 'icon', 'reportedAt')
RESERVED_IDS = ('phoneScreen', 'clock', 'date', 'note', 'notify', 'clear', 'notifications',
                'constructor', 'prototype')
SCREENS = ('home', 'app')
ITEM_ID = re.compile(r'[A-Za-z][A-Za-z0-9_-]*\Z')
LIMITS = {'sources': 6, 'fields': 12}
TARGET_KEYS = {'section', 'sectionPath', 'diagramPath', 'panelPath', 'panelIndex', 'panelId', 'panelType'}
FRAGMENT_KEYS = {'format', 'requestId', 'baseRevision', 'target', 'panel', 'timeline'}
ENTRY_KEYS = {'stepIndex', 'stepId', 'stateAssignment', 'visibilityAssignment'}
PACKET_KEYS = {'format', 'requestId', 'sessionId', 'connectionId', 'project', 'revision', 'sourceSha256',
               'ledgerSha256', 'guide', 'target', 'context', 'fragment'}


class Refusal(ValueError):
    """Fail-closed refusal with at most 20 bounded diagnostics."""

    def __init__(self, message, problems=()):
        super().__init__(message)
        self.problems = [str(item)[:300] for item in list(problems)[:20]]


class _Absent:
    def __repr__(self):
        return '<absent>'


ABSENT = _Absent()


def loads(text, what):
    """Strict JSON: duplicate keys and NaN/Infinity are refused."""
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                raise Refusal(f'{what} repeats the JSON key {json.dumps(key)[:80]}.')
            value[key] = item
        return value

    def constant(name):
        raise Refusal(f'{what} contains the non-JSON number {name}.')
    try:
        return json.loads(text, object_pairs_hook=pairs, parse_constant=constant)
    except Refusal:
        raise
    except (ValueError, RecursionError) as ex:
        raise Refusal(f'{what} is not valid JSON: {str(ex)[:160]}') from None


def sha256_text(text):
    """SHA-256 of UTF-8 text, the same bytes the browser writes and hashes."""
    try:
        return hashlib.sha256(text.encode('utf-8')).hexdigest()
    except UnicodeEncodeError:
        raise Refusal('Text contains an unpaired surrogate; use the full-document flow.') from None


def same(a, b):
    """Structural JSON equality; key order is ignored, booleans are not numbers."""
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[key], b[key]) for key in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    return type(a) is type(b) and a == b


def differences(a, b, path, out):
    if len(out) >= 20 or same(a, b):
        return out
    if isinstance(a, dict) and isinstance(b, dict):
        for key in list(a) + [key for key in b if key not in a]:
            differences(a.get(key, ABSENT), b.get(key, ABSENT), f'{path}.{key}', out)
    elif isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        for index, (x, y) in enumerate(zip(a, b)):
            differences(x, y, f'{path}[{index}]', out)
    elif a is None and isinstance(b, dict):
        out.append(f'{path} is an explicit null reset; v1 keeps it null (no visual keys at a reset).')
    else:
        change = 'was added' if a is ABSENT else 'was removed' if b is ABSENT else 'changed'
        out.append(f'{path} {change}, but it is locked in focused editing.')
    return out


def _object(value):
    return isinstance(value, dict)


def _int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _truthy(value):
    """JavaScript truthiness, used to mirror specSectionPaths()."""
    if value is None or value is False or value == '' or (_int(value) and value == 0):
        return False
    return not (isinstance(value, float) and (value == 0 or value != value))


def section_paths(raw):
    """Mirror of specSectionPaths() in src/workbench/targets.js."""
    if _object(raw) and _truthy(raw.get('page')):
        page, base = raw['page'], ['page']
    elif _object(raw) and (_truthy(raw.get('blocks')) or _truthy(raw.get('sections'))):
        page, base = raw, []
    elif _object(raw) and _truthy(raw.get('nodes')) and _truthy(raw.get('rows')):
        return [{'section': [], 'diagram': []}]
    else:
        return []
    if not _object(page):
        return []
    key = 'blocks' if _truthy(page.get('blocks')) else 'sections'
    out = []
    for i, block in enumerate(page.get(key) if isinstance(page.get(key), list) else []):
        if _object(block) and isinstance(block.get('tabs'), list):
            for j, tab in enumerate(block['tabs']):
                sections = tab.get('sections') if _object(tab) and isinstance(tab.get('sections'), list) else []
                for k in range(len(sections)):
                    out.append({'section': base + [key, i, 'tabs', j, 'sections', k]})
        else:
            out.append({'section': base + [key, i]})
    for record in out:
        record['diagram'] = record['section'] + ['diagram']
    return out


def value_at(raw, path):
    value = raw
    for segment in path:
        if _object(value) and isinstance(segment, str):
            value = value.get(segment)
        elif isinstance(value, list) and _int(segment) and 0 <= segment < len(value):
            value = value[segment]
        else:
            return None
    return value


def resolve(raw, target):
    """Return (diagram, panel) for the packet's canonical address or refuse."""
    if not _object(target) or set(target) != TARGET_KEYS:
        raise Refusal('The task target has an unexpected shape.')
    records = section_paths(raw)
    section, index = target['section'], target['panelIndex']
    if not _int(section) or not 0 <= section < len(records) or not _int(index) or index < 0:
        raise Refusal('The selected panel address no longer resolves in the pinned source.')
    record = records[section]
    if (not same(record['section'], target['sectionPath']) or not same(record['diagram'], target['diagramPath']) or
            not same(record['diagram'] + ['panels', index], target['panelPath'])):
        raise Refusal('The selected panel address no longer resolves in the pinned source.')
    diagram = value_at(raw, record['diagram'])
    panels = diagram.get('panels') if _object(diagram) else None
    if not isinstance(panels, list) or index >= len(panels) or not _object(panels[index]):
        raise Refusal('The selected panel no longer exists in the pinned source.')
    panel = panels[index]
    if (not isinstance(panel.get('id'), str) or not panel['id'] or panel['id'] != target['panelId'] or
            panel.get('type') != 'deviceapp' or target['panelType'] != 'deviceapp'):
        raise Refusal('The selected panel ID or type does not match the task.')
    return diagram, panel


def _patch_problems(patch, fields, where, add):
    for key, value in patch.items():
        if key == 'enterOnce':
            add('enter-once', f'{where}.enterOnce is transient state; v1 does not edit it.')
        elif key in PATCH_KEYS:
            continue
        elif key in fields:
            if value is not None and (not _object(value) or any(k not in FIELD_KEYS for k in value)):
                add('malformed-state', f'{where}.{key} must be null or an object of {", ".join(FIELD_KEYS)}.')
        else:
            add('unknown-key', f'{where}.{key} is not a device-app key.')


def problems(raw, target):
    """Structural eligibility as (code, message) pairs; empty means eligible."""
    diagram, panel = resolve(raw, target)
    out = []

    def add(code, message):
        if len(out) < 20:
            out.append((code, message))
    pid = panel['id']
    nodes = diagram.get('nodes') if _object(diagram.get('nodes')) else {}
    ids = {'sources': [], 'fields': []}
    if sum(1 for item in diagram['panels'] if _object(item) and item.get('id') == pid) != 1:
        add('panel-id', f'Panel ID "{pid}" is not unique in this diagram.')
    for key in ('sources', 'fields'):
        if key not in panel or panel[key] is None:
            continue
        if not isinstance(panel[key], list):
            add('declaration', f'{key} must be an array.')
            continue
        for i, item in enumerate(panel[key]):
            if (not _object(item) or not isinstance(item.get('id'), str) or not ITEM_ID.match(item['id']) or
                    item['id'] in ids[key] or item['id'] in RESERVED_IDS):
                add('declaration', f'{key}[{i}] needs a unique letter-led ID.')
            else:
                ids[key].append(item['id'])
        if len(panel[key]) > LIMITS[key]:
            add('declaration', f'{key} has more entries than the renderer shows.')
    for i, source in enumerate(panel.get('sources') if isinstance(panel.get('sources'), list) else []):
        if _object(source) and source.get('node') is not None and (
                not isinstance(source['node'], str) or source['node'] not in nodes):
            add('dependency', f'sources[{i}].node does not name a diagram node.')
    for i, field in enumerate(panel.get('fields') if isinstance(panel.get('fields'), list) else []):
        if _object(field) and field.get('source') is not None and field['source'] not in ids['sources']:
            add('dependency', f'fields[{i}].source does not name a declared source.')
    for key in ('visible', 'showSources'):
        if key in panel and panel[key] is not None and not isinstance(panel[key], bool):
            add('declaration', f'{key} must be true or false.')
    if 'initial' in panel:
        if not _object(panel['initial']):
            add('malformed-state', 'initial must be an object.')
        else:
            _patch_problems(panel['initial'], ids['fields'], 'initial', add)
    steps = []
    if 'steps' in diagram:
        if isinstance(diagram['steps'], list):
            steps = diagram['steps']
        else:
            add('steps', 'steps must be an array.')
    step_ids = [step['id'] for step in steps if _object(step) and isinstance(step.get('id'), str)]
    for i, step in enumerate(steps):
        if not _object(step):
            add('steps', f'steps[{i}] must be an object.')
            continue
        containers = [key for key in ('panels', 'patch') if key in step]
        for key in containers:
            if not _object(step[key]):
                add('malformed-state', f'steps[{i}].{key} must be an object.')
        if len(containers) == 2:
            add('ambiguous-container', f'steps[{i}] has both panels and legacy patch; v1 cannot tell which one to edit.')
        for key in containers:
            if not _object(step[key]) or pid not in step[key]:
                continue
            if not _object(step[key][pid]):
                add('malformed-state', f'steps[{i}].{key}.{pid} must be an object.')
            else:
                _patch_problems(step[key][pid], ids['fields'], f'steps[{i}].{key}.{pid}', add)
        if 'panelVisibility' in step:
            visibility = step['panelVisibility']
            if not _object(visibility):
                add('malformed-state', f'steps[{i}].panelVisibility must be an object.')
            elif pid in visibility and not isinstance(visibility[pid], bool):
                add('malformed-state', f'steps[{i}].panelVisibility.{pid} must be true or false.')
    if 'paths' in diagram:
        if not isinstance(diagram['paths'], list):
            add('dependency', 'paths must be an array.')
        else:
            for j, route in enumerate(diagram['paths']):
                if (not _object(route) or not isinstance(route.get('id'), str) or not route['id'] or
                        not isinstance(route.get('steps'), list) or not route['steps'] or
                        any(not isinstance(item, str) or item not in step_ids for item in route['steps'])):
                    add('dependency', f'paths[{j}] must list existing step IDs.')
    return out


def _container(step):
    for key in ('panels', 'patch'):
        if key in step and _object(step[key]):
            return key
    return None


def _envelope(container, key):
    if _object(container) and key in container:
        return {'present': True, 'value': copy.deepcopy(container[key])}
    return {'present': False}


def extract(raw, target, request_id, revision):
    """The starting fragment; identical to focusedPanelFragment() in JS."""
    diagram, panel = resolve(raw, target)
    pid = target['panelId']
    timeline = []
    for i, step in enumerate(diagram.get('steps') if isinstance(diagram.get('steps'), list) else []):
        key = _container(step)
        timeline.append({'stepIndex': i, 'stepId': step['id'] if isinstance(step.get('id'), str) else None,
                         'stateAssignment': _envelope(step[key] if key else None, pid),
                         'visibilityAssignment': _envelope(step.get('panelVisibility'), pid)})
    return {'format': FRAGMENT_FORMAT, 'requestId': request_id, 'baseRevision': revision,
            'target': copy.deepcopy(target), 'panel': {'value': copy.deepcopy(panel)}, 'timeline': timeline}


def _envelope_problems(value, where, out):
    if not _object(value) or not isinstance(value.get('present'), bool):
        out.append(f'{where} must be {{"present": false}} or {{"present": true, "value": ...}}.')
    elif value['present'] and set(value) != {'present', 'value'}:
        out.append(f'{where} with present:true needs exactly present and value (value may be null).')
    elif not value['present'] and set(value) != {'present'}:
        out.append(f'{where} with present:false must not contain value.')


def shape_problems(fragment, base):
    """Schema and identity of the edited fragment against the re-derived base."""
    out = []
    if not _object(fragment) or set(fragment) != FRAGMENT_KEYS:
        return [f'The fragment must contain exactly: {", ".join(sorted(FRAGMENT_KEYS))}.']
    for key in ('format', 'requestId', 'baseRevision', 'target'):
        if not same(fragment[key], base[key]):
            out.append(f'{key} must stay exactly as in the task packet.')
    if not _object(fragment['panel']) or set(fragment['panel']) != {'value'} or not _object(fragment['panel']['value']):
        out.append('panel must be {"value": {...the complete panel declaration...}}.')
    timeline = fragment['timeline']
    if not isinstance(timeline, list) or len(timeline) != len(base['timeline']):
        out.append(f'timeline must keep exactly {len(base["timeline"])} entries, one per step.')
        return out
    for i, (entry, before) in enumerate(zip(timeline, base['timeline'])):
        where = f'timeline[{i}]'
        if not _object(entry) or set(entry) != ENTRY_KEYS:
            out.append(f'{where} must contain exactly: {", ".join(sorted(ENTRY_KEYS))}.')
            continue
        if not same(entry['stepIndex'], before['stepIndex']) or not same(entry['stepId'], before['stepId']):
            out.append(f'{where} stepIndex/stepId must stay {before["stepIndex"]}/{json.dumps(before["stepId"])}.')
        _envelope_problems(entry['stateAssignment'], f'{where}.stateAssignment', out)
        _envelope_problems(entry['visibilityAssignment'], f'{where}.visibilityAssignment', out)
        state, visibility = entry['stateAssignment'], entry['visibilityAssignment']
        if _object(state) and state.get('present') is True and not _object(state.get('value')):
            out.append(f'{where}.stateAssignment.value must be an object of device-app keys.')
        if _object(visibility) and visibility.get('present') is True and not isinstance(visibility.get('value'), bool):
            out.append(f'{where}.visibilityAssignment.value must be true or false.')
    return out[:20]


def _field_ids(panel):
    fields = panel.get('fields') if isinstance(panel.get('fields'), list) else []
    return [field['id'] for field in fields if _object(field) and isinstance(field.get('id'), str)]


VISUAL_FIELD_KEYS = ('visible', 'icon')


def _without(value, keys):
    return {key: item for key, item in value.items() if key not in keys}


def _visual_only_field(value):
    return _object(value) and bool(value) and all(key in VISUAL_FIELD_KEYS for key in value)


def _visual_only_patch(patch, fields):
    return _object(patch) and bool(patch) and all(
        key == 'phoneScreen' or (key in fields and _visual_only_field(value)) for key, value in patch.items())


# Presence is compared against the base, never normalized. For an assignment
# object (a whole panel assignment, `initial`, or one card inside them):
#   absent -> object with only visual keys     allowed (new visual assignment)
#   absent -> {}                                locked (new literal empty)
#   visual-only object -> absent                allowed (visual assignment removed)
#   visual-only object -> {}                    locked (would create a new literal empty;
#                                               remove the key or use {"present": false})
#   {} -> {} or {} -> object with visual keys   allowed (the literal is kept or extended)
#   {} -> absent                                locked (the literal is authored content)
#   null <-> anything else                      locked (an explicit reset)
# Non-visual keys inside must be unchanged in every case.
def _compare_field(before, after, where, out):
    if before is None or after is None:
        if before is None and after is not None:
            out.append(f'{where} is an explicit null reset; v1 keeps it null (no visual keys at a reset).')
        elif after is None and before is not None:
            out.append(f'{where} would become a new null reset, but resets are locked in focused editing.')
        return
    if after is not ABSENT and not _object(after):
        out.append(f'{where} changed to a non-object, but card assignments are locked apart from visible and icon.')
        return
    if before is ABSENT and after is ABSENT:
        return
    if before is ABSENT:
        if not after:
            out.append(f'{where}: adding an empty assignment {{}} is locked; omit the key instead.')
        differences({}, _without(after, VISUAL_FIELD_KEYS), where, out)
    elif after is ABSENT:
        if not before:
            out.append(f'{where} is a literal empty assignment in the story and is locked; keep it.')
        elif not _visual_only_field(before):
            differences(_without(before, VISUAL_FIELD_KEYS), {}, where, out)
    else:
        if before and not after and _visual_only_field(before):
            out.append(f'{where} would become a new empty assignment {{}}, which is locked; '
                       'delete the key to remove this visual assignment.')
        differences(_without(before, VISUAL_FIELD_KEYS), _without(after, VISUAL_FIELD_KEYS), where, out)


def _compare_patch(before, after, fields, where, out):
    """A whole panel assignment or `initial`; see the presence table above."""
    if before is ABSENT and after is ABSENT:
        return
    if after is not ABSENT and not _object(after):
        out.append(f'{where} must be an object of device-app keys.')
        return
    old = before if _object(before) else {}
    new = after if _object(after) else {}
    if before is ABSENT and not new:
        out.append(f'{where}: adding an empty assignment {{}} is locked; use {{"present": false}} or omit it.')
    elif after is ABSENT and _object(before) and not old:
        out.append(f'{where} is a literal empty assignment in the story and is locked; keep it.')
    elif after is not ABSENT and not new and _visual_only_patch(before, fields):
        out.append(f'{where} would become a new empty assignment {{}}, which is locked; '
                   'use {"present": false} (or remove initial) to drop this visual assignment.')
    for key in list(old) + [key for key in new if key not in old]:
        if key == 'phoneScreen':
            continue
        if key in fields:
            _compare_field(old.get(key, ABSENT), new.get(key, ABSENT), f'{where}.{key}', out)
        else:
            differences(old.get(key, ABSENT), new.get(key, ABSENT), f'{where}.{key}', out)


def _declaration_skeleton(panel, out):
    skeleton = {key: value for key, value in panel.items() if key not in ('visible', 'showSources', 'fields', 'initial')}
    if 'fields' in panel:
        items = panel['fields']
        if isinstance(items, list) and all(_object(item) and isinstance(item.get('id'), str) for item in items):
            ids = [item['id'] for item in items]
            if len(set(ids)) != len(ids):
                out.append('panel.value.fields repeats a field ID.')
            skeleton['fields'] = {'ids': sorted(ids),
                                  'byId': {item['id']: {k: v for k, v in item.items() if k != 'icon'} for item in items}}
        else:
            skeleton['fields'] = items
    return skeleton  # `initial` is compared by _compare_patch


def _visual_problems(patch, fields, where, out):
    if not _object(patch):
        return
    if 'phoneScreen' in patch and not (isinstance(patch['phoneScreen'], str) and patch['phoneScreen'] in SCREENS):
        out.append(f'{where}.phoneScreen must be "home" or "app".')
    for key in fields:
        value = patch.get(key)
        if not _object(value):
            continue
        if 'visible' in value and not isinstance(value['visible'], bool):
            out.append(f'{where}.{key}.visible must be true or false.')
        if 'icon' in value and value['icon'] is not None and not isinstance(value['icon'], str):
            out.append(f'{where}.{key}.icon must be an icon name or null.')


def allowlist_problems(base, fragment):
    """Everything except the v1 presentation keys must equal the base."""
    out = []
    before, after = base['panel']['value'], fragment['panel']['value']
    fields = _field_ids(before)
    for key in ('visible', 'showSources'):
        if key in after and after[key] is not None and not isinstance(after[key], bool):
            out.append(f'panel.value.{key} must be true or false.')
    for i, item in enumerate(after.get('fields') if isinstance(after.get('fields'), list) else []):
        if _object(item) and 'icon' in item and item['icon'] is not None and not isinstance(item['icon'], str):
            out.append(f'panel.value.fields[{i}].icon must be an icon name or null.')
    _visual_problems(after.get('initial'), fields, 'panel.value.initial', out)
    _compare_patch(before.get('initial', ABSENT), after.get('initial', ABSENT), fields, 'panel.value.initial', out)
    differences(_declaration_skeleton(before, []), _declaration_skeleton(after, out), 'panel.value', out)
    for i, (old, new) in enumerate(zip(base['timeline'], fragment['timeline'])):
        where = f'timeline[{i}].stateAssignment.value'
        before_state, after_state = old['stateAssignment'], new['stateAssignment']
        _visual_problems(after_state.get('value'), fields, where, out)
        _compare_patch(before_state['value'] if before_state['present'] else ABSENT,
                       after_state['value'] if after_state['present'] else ABSENT, fields, where, out)
    return out[:20]


def _ordered_like(new, old):
    """Keep the source's key order so the reviewed diff shows only real edits."""
    if _object(new) and _object(old):
        keys = [key for key in old if key in new] + [key for key in new if key not in old]
        return {key: _ordered_like(new[key], old.get(key)) for key in keys}
    if isinstance(new, list) and isinstance(old, list):
        if all(_object(item) and isinstance(item.get('id'), str) for item in new + old):
            earlier = {item['id']: item for item in old}
            return [_ordered_like(item, earlier.get(item['id'])) for item in new]
        if len(new) == len(old):
            return [_ordered_like(x, y) for x, y in zip(new, old)]
    return new


def _assign(step, key, pid, before, after):
    if after['present']:
        if not _object(step.get(key)):
            step[key] = {}
        step[key][pid] = _ordered_like(copy.deepcopy(after['value']), before.get('value'))
    else:
        del step[key][pid]
        if not step[key]:
            del step[key]  # it had no sibling keys in the pinned source


def merge(raw, base, fragment):
    result = copy.deepcopy(raw)
    target = base['target']
    diagram = value_at(result, target['diagramPath'])
    pid, index = target['panelId'], target['panelIndex']
    diagram['panels'][index] = _ordered_like(copy.deepcopy(fragment['panel']['value']), diagram['panels'][index])
    steps = diagram.get('steps') if isinstance(diagram.get('steps'), list) else []
    changed = []
    for i, (old, new) in enumerate(zip(base['timeline'], fragment['timeline'])):
        step = steps[i]
        if not same(old['stateAssignment'], new['stateAssignment']):
            _assign(step, _container(step) or 'panels', pid, old['stateAssignment'], new['stateAssignment'])
        if not same(old['visibilityAssignment'], new['visibilityAssignment']):
            _assign(step, 'panelVisibility', pid, old['visibilityAssignment'], new['visibilityAssignment'])
        if not same(old, new):
            changed.append(i)
    return result, changed


def strip_selected(raw, target):
    """The document without the selected panel and its step keys (proof only)."""
    value = copy.deepcopy(raw)
    diagram = value_at(value, target['diagramPath'])
    diagram['panels'][target['panelIndex']] = None
    for step in diagram.get('steps') if isinstance(diagram.get('steps'), list) else []:
        for key in ('panels', 'patch', 'panelVisibility'):
            if _object(step) and _object(step.get(key)):
                step[key].pop(target['panelId'], None)
                if not step[key]:
                    del step[key]
    return value


def assemble(raw, packet, fragment):
    """Return (complete candidate, summary) or raise Refusal. No I/O."""
    target = packet['target']
    found = problems(raw, target)
    if found:
        raise Refusal('The pinned source is not eligible for focused device-app editing.', [m for _, m in found])
    base = extract(raw, target, packet['requestId'], packet['revision'])
    if not same(base, packet['fragment']):
        raise Refusal('The task packet does not match the pinned source. Start a new focused request.')
    shape = shape_problems(fragment, base)
    if shape:
        raise Refusal('candidate.panel.json does not follow the focused fragment format.', shape)
    locked = allowlist_problems(base, fragment)
    if locked:
        raise Refusal('The fragment changes content outside the presentation allowlist. '
                      'Revert those keys, or ask the user to use the full-document flow.', locked)
    result, steps = merge(raw, base, fragment)
    # Prove the merge: eligible, exact round trip, and nothing unrelated moved.
    if problems(result, target) or not same(extract(result, target, fragment['requestId'], fragment['baseRevision']), fragment):
        raise Refusal('The merged candidate did not round-trip; nothing was written.')
    if not same(strip_selected(raw, target), strip_selected(result, target)):
        raise Refusal('The merge changed content outside the selected panel; nothing was written.')
    return result, {'panelChanged': not same(base['panel'], fragment['panel']), 'changedSteps': steps[:100],
                    'unchanged': same(raw, result)}


def packet_problems(packet, request, state, owner, request_id, task_name, task_sha256):
    """Identity binding between the request, packet and pinned state."""
    out = []
    focus = request.get('focus')
    if request.get('mode') != MODE or not _object(focus) or set(focus) != {'format', 'file', 'sha256'}:
        return ['This request was not registered for focused device-app editing; use the full-document flow.']
    if focus['format'] != PACKET_FORMAT or focus['file'] != task_name or task_name != f'focus-{request_id}.json':
        out.append(f'--task must be the registered packet {focus.get("file")!s:.140}.')
    if focus['sha256'] != task_sha256:
        out.append('The task packet bytes do not match the SHA-256 registered in request.json.')
    if not _object(packet) or set(packet) != PACKET_KEYS or packet.get('format') != PACKET_FORMAT:
        return out + ['The task packet has an unexpected format.']
    if packet['requestId'] != request_id or request.get('id') != request_id:
        out.append('The task packet belongs to another request.')
    if any(packet.get(key) != value or state.get(key) != value for key, value in owner.items()):
        out.append('The task packet or state.json belongs to another session or connection.')
    if not (packet['revision'] == request.get('revision') == state.get('revision')):
        out.append('The story changed after this request was registered (revision mismatch). Start a new request.')
    if not (same(packet['project'], request.get('project')) and same(packet['project'], state.get('project'))):
        out.append('The task packet belongs to another project.')
    source, ledger = state.get('source'), state.get('ledger')
    if not isinstance(source, str) or sha256_text(source) != packet['sourceSha256']:
        out.append('The current source hash does not match the task packet.')
    if not isinstance(ledger, str) or not ledger.strip() or sha256_text(ledger) != packet['ledgerSha256']:
        out.append('The current coverage ledger is missing or its hash does not match the task packet.')
    return out


def _validator_path(path):
    parts = []
    for segment in path:
        parts.append(f'[{segment}]' if _int(segment) else ('.' if parts else '') + str(segment))
    return ''.join(parts)


def selected_warning(message, target):
    """Mirror of focusedPanelWarningMatches() in JS."""
    section = list(target['sectionPath'])
    if section[:1] == ['page']:
        section = section[1:]
    prefixes = [_validator_path(section) + '.diagram'] if section else ['blocks[0].diagram', 'sections[0].diagram', 'diagram']
    pid = re.escape(target['panelId'])
    return any(re.search(re.escape(prefix) + r'(?:\.panels\[' + str(target['panelIndex']) + r'\]|\.steps\[\d+\]\.(?:panels|panelVisibility)\.' +
                         pid + r')(?=[.:\s\[]|$)', message) for prefix in prefixes)


def parse_validation(output, files):
    """Parse tools/validate.js output for {label: path}; refuse unknown output."""
    reports = {label: {'errors': [], 'warnings': [], 'done': False} for label in files}
    for line in output.splitlines():
        for label, path in files.items():
            prefix = path + ': '
            if not line.startswith(prefix):
                continue
            rest, report = line[len(prefix):], reports[label]
            if rest.startswith('ERROR '):
                report['errors'].append(rest[6:])
            elif rest.startswith('warn  ') or rest.startswith('lint  '):
                report['warnings'].append(rest[6:])
            elif re.fullmatch(r'\d+ errors, \d+ warnings', rest):
                report['done'] = True
    if not all(report['done'] for report in reports.values()):
        raise Refusal('The bundled validator did not report a result; nothing was written.')
    return reports


def validation_problems(reports, target):
    base, candidate = reports['base'], reports['candidate']
    out = []
    if base['errors']:
        out.append('The pinned source already has validator errors; use the full-document flow.')
    out += [f'Selected panel warning in the pinned source: {message}' for message in base['warnings']
            if selected_warning(message, target)]
    out += [f'Candidate validator error: {message}' for message in candidate['errors']]
    added = collections.Counter(candidate['warnings']) - collections.Counter(base['warnings'])
    out += [f'New validator warning: {message}' for message in added.elements()]
    return out[:20]


def dumps_like(value, source):
    """Serialize like the source's indentation; structurally exact."""
    lines = source.strip().split('\n')
    if len(lines) < 2:
        text = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    else:
        second = lines[1]
        text = json.dumps(value, ensure_ascii=False, indent=second[:len(second) - len(second.lstrip(' \t'))] or 2)
    return text + ('\n' if source.endswith('\n') else '')
