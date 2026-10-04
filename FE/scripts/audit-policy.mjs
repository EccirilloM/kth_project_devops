export function auditDecision(report) {
  if (!report || report.error || report.auditReportVersion !== 2 || !report.vulnerabilities ||
      typeof report.vulnerabilities !== 'object' || Array.isArray(report.vulnerabilities)) {
    throw new Error('Dependency audit returned an invalid or unsuccessful report.');
  }
  const counts = report.metadata?.vulnerabilities;
  const severities = ['info', 'low', 'moderate', 'high', 'critical', 'total'];
  if (!counts || severities.some(key => !Number.isSafeInteger(counts[key]) || counts[key] < 0)) {
    throw new Error('Dependency audit is missing valid vulnerability counts.');
  }
  return {blocked: counts.high > 0 || counts.critical > 0, counts};
}
