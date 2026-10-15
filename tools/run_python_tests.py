#!/usr/bin/env python3
"""Run the Python suite and save a structured result without extra packages."""

import argparse
import json
from pathlib import Path
import sys
import time
import unittest


class StructuredResult(unittest.TextTestResult):
    STATUS_PRIORITY = {
        "running": 0,
        "success": 1,
        "skipped": 1,
        "expected_failure": 1,
        "unexpected_success": 2,
        "failure": 3,
        "error": 4,
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.records = []
        self._active = {}

    def startTest(self, test):
        super().startTest(test)
        record = {"id": test.id(), "status": "running"}
        self.records.append(record)
        self._active[id(test)] = (record, time.perf_counter())

    def stopTest(self, test):
        active = self._active.pop(id(test), None)
        if active:
            record, started = active
            record["duration_seconds"] = round(time.perf_counter() - started, 6)
        super().stopTest(test)

    def _record_for(self, test):
        active = self._active.get(id(test))
        if active:
            return active[0]
        record = {"id": test.id(), "status": "running"}
        self.records.append(record)
        return record

    def _record(self, test, status, detail=None):
        record = self._record_for(test)
        outcome = {"status": status}
        if detail:
            outcome["detail"] = detail
            record.setdefault("detail", detail)
        record.setdefault("outcomes", []).append(outcome)
        if self.STATUS_PRIORITY[status] >= self.STATUS_PRIORITY[record["status"]]:
            record["status"] = status
        return record

    def addSuccess(self, test):
        self._record(test, "success")
        super().addSuccess(test)

    def addFailure(self, test, err):
        self._record(test, "failure", self._exc_info_to_string(err, test))
        super().addFailure(test, err)

    def addError(self, test, err):
        self._record(test, "error", self._exc_info_to_string(err, test))
        super().addError(test, err)

    def addSkip(self, test, reason):
        self._record(test, "skipped", reason)
        super().addSkip(test, reason)

    def addExpectedFailure(self, test, err):
        self._record(test, "expected_failure", self._exc_info_to_string(err, test))
        super().addExpectedFailure(test, err)

    def addUnexpectedSuccess(self, test):
        self._record(test, "unexpected_success")
        super().addUnexpectedSuccess(test)

    def addSubTest(self, test, subtest, err):
        if err is not None:
            status = "failure" if issubclass(err[0], test.failureException) else "error"
            detail = self._exc_info_to_string(err, subtest)
            record = self._record(test, status, detail)
            record.setdefault("subtests", []).append({
                "id": subtest.id(),
                "status": status,
                "detail": detail,
            })
        super().addSubTest(test, subtest, err)


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("-s", "--start-directory", default="tests")
    parser.add_argument("-p", "--pattern", default="test*.py")
    parser.add_argument("-t", "--top-level-directory")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    suite = unittest.defaultTestLoader.discover(
        start_dir=args.start_directory,
        pattern=args.pattern,
        top_level_dir=args.top_level_directory,
    )
    result = unittest.TextTestRunner(verbosity=2, resultclass=StructuredResult).run(suite)
    test_counts = {}
    outcome_counts = {}
    for record in result.records:
        test_counts[record["status"]] = test_counts.get(record["status"], 0) + 1
        for outcome in record.get("outcomes", []):
            status = outcome["status"]
            outcome_counts[status] = outcome_counts.get(status, 0) + 1
    report = {
        "schema": 1,
        "successful": result.wasSuccessful(),
        "tests_run": result.testsRun,
        "counts": {"tests": test_counts, "outcomes": outcome_counts},
        "tests": result.records,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
