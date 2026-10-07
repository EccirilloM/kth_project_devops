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

export function auditDetails(report) {
  return Object.entries(report.vulnerabilities).sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([name, finding]) => {
      const lines = [`${name}: ${finding.severity} (affected range: ${finding.range ?? 'not reported'})`];
      for (const cause of finding.via ?? []) {
        if (typeof cause === 'string') lines.push(`  Via dependency: ${cause}`);
        else if (cause && typeof cause === 'object') {
          lines.push(`  ${cause.title ?? 'Dependency advisory'}${cause.url ? ' — ' + cause.url : ''}`);
        }
      }
      const fix = finding.fixAvailable;
      if (fix && typeof fix === 'object') {
        lines.push(`  Proposed fix: ${fix.name}@${fix.version}${fix.isSemVerMajor ? ' (major upgrade; review compatibility)' : ''}`);
      } else {
        lines.push(fix ? '  Fix available; review the dependency update.' : '  No automatic fix reported.');
      }
      return lines;
    });
}
