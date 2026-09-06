#!/usr/bin/env python3
"""Check real Android text bounds after opening a screen (requires adb and a dev build).

Example: python3 scripts/check-android-layout.py --text-prefix 'Clock-in opens'
Use --xml to replay a captured UI Automator hierarchy; --density is required then.
Only reads the app's UI. Never taps controls or changes app data/device settings.
"""
import argparse
import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--text-prefix', action='append', required=True)
parser.add_argument('--xml', type=Path)
parser.add_argument('--density', type=int)
parser.add_argument('--gutter', type=float, default=16, help='Minimum page gutter in dp')
args = parser.parse_args()


def adb(*arguments):
    return subprocess.check_output(['adb', *arguments], text=True)


if args.xml:
    if args.density is None:
        parser.error('--density is required with --xml')
    xml = args.xml.read_text()
else:
    # Clear the previous capture so a failed dump cannot pass with stale evidence.
    adb('shell', 'rm', '-f', '/sdcard/jooling-layout.xml')
    adb('shell', 'uiautomator', 'dump', '/sdcard/jooling-layout.xml')
    xml = adb('shell', 'cat', '/sdcard/jooling-layout.xml')
    if args.density is None:
        args.density = int(re.findall(r'density: (\d+)', adb('shell', 'wm', 'density'))[-1])

root = ET.fromstring(xml)
nodes = list(root.iter('node'))


def bounds(node):
    return tuple(map(int, re.findall(r'\d+', node.attrib['bounds'])))


width = max(bounds(node)[2] for node in nodes)
gutter = args.gutter * args.density / 160
failures = []
for prefix in args.text_prefix:
    matches = [node for node in nodes if node.get('text', '').startswith(prefix)]
    if not matches:
        failures.append(f'Missing visible text starting with {prefix!r}')
    for node in matches:
        left, top, right, bottom = bounds(node)
        if bottom <= top or right <= left:
            failures.append(f'{prefix!r}: text has no visible bounds')
        elif left < gutter - 1 or right > width - gutter + 1:
            failures.append(f'{prefix!r}: [{left}, {right}] exceeds page [{gutter:g}, {width-gutter:g}]')

if failures:
    raise SystemExit('FAIL\n' + '\n'.join(failures))
print(f'PASS: {len(args.text_prefix)} text checks stay within the {width}px viewport and {args.gutter:g}dp gutters')
