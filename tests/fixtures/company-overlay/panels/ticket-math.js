/* Company helper module: loaded before every panel type that uses it. */
var CompanyTicketMath = Object.freeze({
  valid: function (value) { return typeof value === 'number' && isFinite(value) && value >= 0 && Math.floor(value) === value; },
  percent: function (done, total) { return total > 0 ? clamp(done / total * 100, 0, 100) : 0; }
});
