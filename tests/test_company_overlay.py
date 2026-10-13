"""Company overlay inside the normal suite: loads company/tests/test_*.py.

Upstream ships no company tests, so this module adds nothing there.
"""
import importlib.util
import unittest
from pathlib import Path

COMPANY_TESTS = Path(__file__).resolve().parent.parent / 'company' / 'tests'


def load_tests(loader, standard_tests, pattern):
    for path in sorted(COMPANY_TESTS.glob('test_*.py')) if COMPANY_TESTS.is_dir() else []:
        spec = importlib.util.spec_from_file_location('company_tests.' + path.stem, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        standard_tests.addTests(loader.loadTestsFromModule(module))
    return standard_tests
