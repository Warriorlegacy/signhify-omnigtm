import { Repo, loadEnvFiles } from '@omnigtm/core';

loadEnvFiles();

const repo = await Repo.open();
const rows = await repo.listOpportunities({ limit: 15 });
for (const o of rows) {
  console.log([o.fit_score, o.company_name, o.role_title.slice(0, 50), o.track, (o.pain_point_summary || '-').slice(0, 60)].join(' | '));
}
