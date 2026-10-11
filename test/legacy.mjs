// Pins odd behaviour that the parser-pipeline refactor deliberately left as it is.
// Each test is named `legacy: ...` and matches a `LEGACY(parser-pipeline)` comment in lib/.
// Changing one of these behaviours is a feature decision, not a cleanup.
import assert from 'node:assert';
import plugin, { adapters } from '../index.mjs';
import { paginate } from '../lib/processors/paginate.mjs';
import { parseHabr } from '../lib/providers/habr-career.mjs';
import { parseGeekjob } from '../lib/providers/geekjob.mjs';
import { parseSuperjob } from '../lib/providers/superjob.mjs';
import { parseTrudvsem } from '../lib/providers/trudvsem.mjs';
import { SourceError } from '../lib/errors.mjs';

const tests = [];
const test = (name, run) => tests.push({ name, run });
const job = id => ({
  title: `Job ${id}`,
  url: `https://example.test/${id}`,
  note: 'source: habr-career',
});
const silent = { log() {} };

const habrPage = card =>
  `<html><body><div class="vacancy-card">${card}</div></body></html>`;
const habrCard = ({ date = '', chips = '' } = {}) => `
  <div class="vacancy-card__date">${date}</div>
  <div class="vacancy-card__company"><a>Acme</a></div>
  <a class="vacancy-card__title-link" href="/vacancies/1">Engineer</a>
  ${chips}`;

test('legacy: getmatch and helloworld-rs stop remaining routes on an access error, others do not', async () => {
  const load = async (route, _page) => {
    if (route === 'a') throw new SourceError('access', 'blocked');
    return { jobs: [job(route)], hasNext: false };
  };
  assert.deepStrictEqual(
    (await paginate('superjob', ['a', 'b'], 1, load, silent)).map(j => j.title),
    ['Job b'],
  );
  await assert.rejects(
    paginate('getmatch', ['a', 'b'], 1, load, silent),
    e => e.category === 'access',
  );
  const jobs = await paginate(
    'helloworld-rs',
    ['b', 'a', 'c'],
    1,
    load,
    silent,
  );
  assert.deepStrictEqual(
    jobs.map(j => j.title),
    ['Job b'],
  );
});

test('legacy: paginate writes matchedQueries onto the job objects returned by the provider', async () => {
  const returned = job(1);
  await paginate(
    'superjob',
    ['q'],
    1,
    async () => ({ jobs: [returned], hasNext: false }),
    silent,
  );
  assert.deepStrictEqual(returned.matchedQueries, [
    { query: 'q', queryId: 'superjob-q1' },
  ]);
});

test('legacy: paginate stops a route on an empty page unless the provider sets continueOnEmpty', async () => {
  let calls = 0;
  await paginate(
    'superjob',
    ['q'],
    3,
    async () => {
      calls++;
      return { jobs: [], hasNext: true };
    },
    silent,
  );
  assert.strictEqual(calls, 1);
  calls = 0;
  const emptyButContinue = async () => {
    calls++;
    return { jobs: [], hasNext: true, continueOnEmpty: true };
  };
  await paginate('getmatch', ['q'], 3, emptyButContinue, silent);
  assert.strictEqual(calls, 3);
});

test('legacy: index.mjs calls adapters with (config, ctx) only, so fetch options are never passed', async () => {
  const original = adapters['habr-career'];
  const seen = [];
  adapters['habr-career'] = (...args) => {
    seen.push(args.length);
    return original(...args);
  };
  try {
    await plugin.provider.fetch(
      { ru_market: { source: 'habr-career' } },
      {
        fetchText: async () =>
          '<html><body><div class="no-content">Вакансий нет</div></body></html>',
        ...silent,
      },
    );
  } finally {
    adapters['habr-career'] = original;
  }
  assert.deepStrictEqual(seen, [2]);
});

test('legacy: habr seniority chips are removed from the location by hard-coded English labels', () => {
  const chip = text => `<span class="chip-with-icon__text">${text}</span>`;
  const chips = ['Senior', 'Москва', 'Lead', 'Москва'].map(chip).join('');
  const [parsed] = parseHabr(habrPage(habrCard({ chips }))).jobs;
  assert.strictEqual(parsed.location, 'Москва');
});

test('legacy: habr drops the date of a card whose date text says "updated"', () => {
  const dated = '<time datetime="2026-09-25T10:30:00+03:00">25 сентября</time>';
  const [fresh] = parseHabr(habrPage(habrCard({ date: dated }))).jobs;
  assert.strictEqual(fresh.postedAt, Date.parse('2026-09-25T10:30:00+03:00'));
  const [updated] = parseHabr(
    habrPage(habrCard({ date: `обновлено ${dated}` })),
  ).jobs;
  assert.strictEqual('postedAt' in updated, false);
});

test('legacy: superjob and trudvsem rebuild the salary note from parsed amounts with the same wording', () => {
  const superjob = parseSuperjob({
    more: false,
    objects: [
      {
        profession: 'Dev',
        link: 'https://www.superjob.ru/vakansii/dev-123.html',
        currency: 'rub',
        payment_from: 100,
        payment_to: 200,
      },
    ],
  });
  assert.strictEqual(
    superjob.jobs[0].note,
    'source: superjob; salary: from 100 to 200 RUB',
  );
  const trudvsem = parseTrudvsem({
    status: '200',
    meta: { total: 1 },
    results: {
      vacancies: [
        {
          vacancy: {
            'job-name': 'Dev',
            vac_url: 'https://trudvsem.ru/vacancy/card/123/abc-1',
            currency: 'руб.',
            salary_min: 100,
            salary_max: 200,
          },
        },
      ],
    },
  });
  assert.strictEqual(
    trudvsem.jobs[0].note,
    'source: trudvsem; salary: from 100 to 200 RUB',
  );
});

test('legacy: geekjob uses a card date only when it carries an explicit publication label', () => {
  const page =
    time => `<html><body><ul id="serplist" class="serp-list"><li class="collection-item avatar">
    <a class="title" href="/vacancy/${'a'.repeat(24)}">Dev</a>${time}</li></ul></body></html>`;
  const plain = parseGeekjob(
    page('<time datetime="2026-09-25">25 сентября</time>'),
  ).jobs[0];
  assert.strictEqual('postedAt' in plain, false);
  const labelled =
    '<time itemprop="datePosted" datetime="2026-09-25">25 сентября</time>';
  const posted = parseGeekjob(page(labelled)).jobs[0];
  assert.strictEqual(posted.postedAt, Date.parse('2026-09-25T00:00:00+03:00'));
});

let failures = 0;
for (const { name, run } of tests) {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL - ${name}`, error);
  }
}
console.log(`${tests.length - failures}/${tests.length} legacy tests passed`);
process.exitCode = failures ? 1 : 0;
