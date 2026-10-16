import json
from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "tools" / "run_python_tests.py"


class StructuredPythonTestRunnerTests(unittest.TestCase):
    def run_fixture(self, source):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            (directory / "test_fixture.py").write_text(textwrap.dedent(source), encoding="utf-8")
            report = directory / "result.json"
            completed = subprocess.run(
                [sys.executable, str(RUNNER), "--start-directory", str(directory), "--report", str(report)],
                cwd=ROOT,
                text=True,
                capture_output=True,
            )
            return completed, json.loads(report.read_text(encoding="utf-8"))

    def test_failure_error_and_unexpected_success_keep_the_run_red(self):
        completed, report = self.run_fixture("""
            import unittest

            class Statuses(unittest.TestCase):
                def test_pass(self): pass
                def test_failure(self): self.fail("failure detail")
                def test_error(self): raise RuntimeError("error detail")
                @unittest.skip("skip detail")
                def test_skip(self): pass
                @unittest.expectedFailure
                def test_expected_failure(self): self.fail("expected detail")
                @unittest.expectedFailure
                def test_unexpected_success(self): pass
        """)
        self.assertEqual(completed.returncode, 1)
        self.assertFalse(report["successful"])
        self.assertEqual(report["tests_run"], 6)
        expected_counts = {
            "error": 1, "expected_failure": 1, "failure": 1,
            "success": 1, "skipped": 1, "unexpected_success": 1,
        }
        self.assertEqual(report["counts"], {"tests": expected_counts, "outcomes": expected_counts})
        records = {record["status"]: record for record in report["tests"]}
        self.assertIn("failure detail", records["failure"]["detail"])
        self.assertIn("error detail", records["error"]["detail"])
        self.assertEqual(records["skipped"]["detail"], "skip detail")
        self.assertIn("test_failure", completed.stderr)

    def test_success_skip_and_expected_failure_keep_the_run_green(self):
        completed, report = self.run_fixture("""
            import unittest

            class Statuses(unittest.TestCase):
                def test_pass(self): pass
                @unittest.skip("skip detail")
                def test_skip(self): pass
                @unittest.expectedFailure
                def test_expected_failure(self): self.fail("expected detail")
        """)
        self.assertEqual(completed.returncode, 0)
        self.assertTrue(report["successful"])
        self.assertEqual(report["tests_run"], 3)
        expected_counts = {"expected_failure": 1, "success": 1, "skipped": 1}
        self.assertEqual(report["counts"], {"tests": expected_counts, "outcomes": expected_counts})

    def test_module_setup_error_is_reported_before_any_test_starts(self):
        completed, report = self.run_fixture("""
            import unittest

            def setUpModule():
                raise RuntimeError("module setup detail")

            class Statuses(unittest.TestCase):
                def test_never_runs(self): pass
        """)
        self.assertEqual(completed.returncode, 1)
        self.assertFalse(report["successful"])
        self.assertEqual(report["tests_run"], 0)
        self.assertEqual(report["counts"], {"tests": {"error": 1}, "outcomes": {"error": 1}})
        self.assertIn("setUpModule", report["tests"][0]["id"])
        self.assertIn("module setup detail", report["tests"][0]["detail"])

    def test_class_setup_skip_is_reported_without_turning_the_run_red(self):
        completed, report = self.run_fixture("""
            import unittest

            class Statuses(unittest.TestCase):
                @classmethod
                def setUpClass(cls):
                    raise unittest.SkipTest("class setup skip")
                def test_never_runs(self): pass
        """)
        self.assertEqual(completed.returncode, 0)
        self.assertTrue(report["successful"])
        self.assertEqual(report["tests_run"], 0)
        self.assertEqual(report["counts"], {"tests": {"skipped": 1}, "outcomes": {"skipped": 1}})
        self.assertIn("setUpClass", report["tests"][0]["id"])
        self.assertEqual(report["tests"][0]["detail"], "class setup skip")

    def test_skipped_and_failed_subtests_are_both_represented(self):
        completed, report = self.run_fixture("""
            import unittest

            class Statuses(unittest.TestCase):
                def test_subtests(self):
                    with self.subTest(case="skip"):
                        self.skipTest("subtest skip")
                    with self.subTest(case="failure"):
                        self.fail("subtest failure")
        """)
        self.assertEqual(completed.returncode, 1)
        self.assertFalse(report["successful"])
        self.assertEqual(report["tests_run"], 1)
        expected_counts = {"skipped": 1, "failure": 1}
        self.assertEqual(report["counts"], {"tests": expected_counts, "outcomes": expected_counts})
        skipped = next(record for record in report["tests"] if record["status"] == "skipped")
        failed = next(record for record in report["tests"] if record["status"] == "failure")
        self.assertEqual(skipped["detail"], "subtest skip")
        self.assertIn("subtest failure", failed["subtests"][0]["detail"])

    def test_cleanup_and_module_teardown_errors_are_both_reported(self):
        completed, report = self.run_fixture("""
            import unittest

            def tearDownModule():
                raise RuntimeError("module teardown detail")

            class Statuses(unittest.TestCase):
                def test_cleanup(self):
                    self.addCleanup(lambda: (_ for _ in ()).throw(RuntimeError("cleanup detail")))
        """)
        self.assertEqual(completed.returncode, 1)
        self.assertFalse(report["successful"])
        self.assertEqual(report["tests_run"], 1)
        expected_counts = {"error": 2}
        self.assertEqual(report["counts"], {"tests": expected_counts, "outcomes": expected_counts})
        details = "\n".join(record["detail"] for record in report["tests"])
        self.assertIn("cleanup detail", details)
        self.assertIn("module teardown detail", details)

    def test_body_and_cleanup_errors_keep_both_outcomes_and_traces(self):
        completed, report = self.run_fixture("""
            import unittest

            class Statuses(unittest.TestCase):
                def test_two_errors(self):
                    self.addCleanup(lambda: (_ for _ in ()).throw(RuntimeError("cleanup exploded")))
                    raise RuntimeError("body exploded")
        """)
        self.assertEqual(completed.returncode, 1)
        self.assertFalse(report["successful"])
        self.assertEqual(report["tests_run"], 1)
        self.assertEqual(report["counts"], {
            "tests": {"error": 1},
            "outcomes": {"error": 2},
        })
        self.assertEqual(len(report["tests"]), 1)
        outcomes = report["tests"][0]["outcomes"]
        self.assertEqual([outcome["status"] for outcome in outcomes], ["error", "error"])
        details = "\n".join(outcome["detail"] for outcome in outcomes)
        self.assertIn("body exploded", details)
        self.assertIn("cleanup exploded", details)


if __name__ == "__main__":
    unittest.main()
