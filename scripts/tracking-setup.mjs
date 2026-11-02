#!/usr/bin/env node
// Wires the site's lead events through to GA4, via the Tag Manager and GA4
// Admin APIs instead of by hand in two web UIs.
//
// Why this exists: the pages push every lead event into dataLayer, but GTM only
// forwards what it has a tag for. Without that tag GA4 records page views and
// nothing else, which is exactly the state this site was in. A direct
// gtag('event', ...) call from the page does NOT work around it: GTM owns the
// gtag instance and swallows anything it has no tag for. Verified live.
//
//   node scripts/tracking-setup.mjs            inspect only, changes nothing
//   node scripts/tracking-setup.mjs --apply    create/update the variables, trigger and tag
//   node scripts/tracking-setup.mjs --publish  publish a container version (implies --apply)
//
// Every write is idempotent and matched by name, so a second run updates in
// place rather than creating a duplicate tag.
import {
  AuthError,
  googleFetch,
  hasScope,
  requireScope,
  SCOPE_ANALYTICS_EDIT,
  SCOPE_GTM_EDIT,
  SCOPE_GTM_PUBLISH,
} from './google-auth.mjs';
import { EVENT_PARAMS, KEY_EVENTS, LEAD_EVENTS } from './lead-events.mjs';

const GTM_PUBLIC_ID = 'GTM-WR9TZHT';
const GA4_MEASUREMENT_ID = 'G-09Z0MLQE3L';
const GA4_PROPERTY_ID = '353050179';

const TM = 'https://tagmanager.googleapis.com/tagmanager/v2';
const ADMIN = 'https://analyticsadmin.googleapis.com/v1beta';

// Everything the site pushes that represents a real person doing something we
// care about. Keep in sync with the tracker at the end of shared.js.
const TRIGGER_NAME = 'Lead events';
const TAG_NAME = 'GA4 - Lead events';
const dlvName = (p) => `DLV - ${p}`;

const argv = process.argv.slice(2);
const PUBLISH = argv.includes('--publish');
const APPLY = PUBLISH || argv.includes('--apply');

function log(...a) {
  console.log(...a);
}

// ---------------------------------------------------------------- GTM lookups

async function findWorkspace() {
  const accounts = (await googleFetch(`${TM}/accounts`, { label: 'GTM accounts' })).account || [];
  for (const account of accounts) {
    const containers =
      (await googleFetch(`${TM}/${account.path}/containers`, { label: 'GTM containers' })).container || [];
    const match = containers.find((c) => c.publicId === GTM_PUBLIC_ID);
    if (!match) continue;
    const workspaces =
      (await googleFetch(`${TM}/${match.path}/workspaces`, { label: 'GTM workspaces' })).workspace || [];
    if (!workspaces.length) throw new Error(`Container ${GTM_PUBLIC_ID} has no workspace to write to.`);
    const ws = workspaces.find((w) => w.name === 'Default Workspace') || workspaces[0];
    return { account, container: match, workspace: ws };
  }
  throw new Error(
    `Container ${GTM_PUBLIC_ID} is not visible to this Google account. ` +
      `Check you authorized as the account that owns the container.`
  );
}

// ------------------------------------------------------- idempotent upserting

// Creates the entity, or updates the existing one of the same name in place.
// Returns the live entity either way.
async function upsert({ kind, workspace, existing, name, body }) {
  const found = existing.find((e) => e.name === name);
  if (!APPLY) {
    log(`  ${found ? 'exists' : 'would create'}  ${kind}: ${name}`);
    return found || null;
  }
  if (found) {
    const updated = await googleFetch(`${TM}/${found.path}`, {
      method: 'PUT',
      body: { ...body, name },
      label: `update ${kind} ${name}`,
    });
    log(`  updated  ${kind}: ${name}`);
    return updated;
  }
  const created = await googleFetch(`${TM}/${workspace.path}/${kind}`, {
    method: 'POST',
    body: { ...body, name },
    label: `create ${kind} ${name}`,
  });
  log(`  created  ${kind}: ${name}`);
  return created;
}

// --------------------------------------------------------------- entity shapes

function dataLayerVariable(param) {
  return {
    type: 'v',
    parameter: [
      { type: 'integer', key: 'dataLayerVersion', value: '2' },
      { type: 'boolean', key: 'setDefaultValue', value: 'false' },
      { type: 'template', key: 'name', value: param },
    ],
  };
}

function leadTrigger() {
  return {
    type: 'customEvent',
    customEventFilter: [
      {
        type: 'matchRegex',
        parameter: [
          { type: 'template', key: 'arg0', value: '{{_event}}' },
          { type: 'template', key: 'arg1', value: `^(${LEAD_EVENTS.join('|')})$` },
        ],
      },
    ],
  };
}

// One GA4 event tag for every lead event. Event name is the built-in {{Event}}
// variable, so GA4 receives the real event name rather than a hardcoded one and
// adding a new event to LEAD_EVENTS needs no new tag.
function leadTag(triggerId, measurementParam) {
  return {
    type: 'gaawe',
    parameter: [
      { type: 'template', key: 'eventName', value: '{{Event}}' },
      { type: 'boolean', key: 'sendEcommerceData', value: 'false' },
      {
        type: 'list',
        key: 'eventSettingsTable',
        list: EVENT_PARAMS.map((p) => ({
          type: 'map',
          map: [
            { type: 'template', key: 'parameter', value: p },
            { type: 'template', key: 'parameterValue', value: `{{${dlvName(p)}}}` },
          ],
        })),
      },
      measurementParam,
    ],
    firingTriggerId: [triggerId],
  };
}

// ----------------------------------------------------------------------- main

async function main() {
  await requireScope(SCOPE_GTM_EDIT, 'Setting up the GA4 tag in Tag Manager');
  if (PUBLISH) await requireScope(SCOPE_GTM_PUBLISH, 'Publishing the container version');

  const { account, container, workspace } = await findWorkspace();
  log(`Account    ${account.name}`);
  log(`Container  ${container.name} (${container.publicId})`);
  log(`Workspace  ${workspace.name}`);
  log(APPLY ? '\nMode: APPLY (writing changes)\n' : '\nMode: inspect only (pass --apply to write)\n');

  const tags = (await googleFetch(`${TM}/${workspace.path}/tags`, { label: 'tags' })).tag || [];
  const triggers = (await googleFetch(`${TM}/${workspace.path}/triggers`, { label: 'triggers' })).trigger || [];
  const variables = (await googleFetch(`${TM}/${workspace.path}/variables`, { label: 'variables' })).variable || [];

  log('Existing tags:');
  for (const t of tags) log(`  - ${t.name}  [${t.type}]`);
  log('Existing triggers:');
  for (const t of triggers) log(`  - ${t.name}  [${t.type}]`);
  log('');

  // How a GA4 event tag names its destination differs by container vintage, so
  // copy whatever an existing GA4 tag in this container already does rather than
  // guessing. Falls back to a literal measurement ID override.
  const siblingEvent = tags.find((t) => t.type === 'gaawe');
  const configTag = tags.find((t) => t.type === 'googtag' || t.type === 'gaawc');
  let measurementParam = { type: 'template', key: 'measurementIdOverride', value: GA4_MEASUREMENT_ID };
  if (siblingEvent) {
    const copied = (siblingEvent.parameter || []).find((p) =>
      ['measurementId', 'measurementIdOverride', 'tagId'].includes(p.key)
    );
    if (copied) {
      measurementParam = copied;
      log(`Destination: copied "${copied.key}" from existing GA4 tag "${siblingEvent.name}"`);
    }
  } else if (configTag) {
    log(`Destination: measurementIdOverride=${GA4_MEASUREMENT_ID} (config tag "${configTag.name}" is [${configTag.type}])`);
  } else {
    log(`Destination: measurementIdOverride=${GA4_MEASUREMENT_ID} (no GA4 config tag found in container)`);
  }
  log('');

  log('Data layer variables:');
  for (const p of EVENT_PARAMS) {
    await upsert({
      kind: 'variables',
      workspace,
      existing: variables,
      name: dlvName(p),
      body: dataLayerVariable(p),
    });
  }

  log('\nTrigger:');
  const trigger = await upsert({
    kind: 'triggers',
    workspace,
    existing: triggers,
    name: TRIGGER_NAME,
    body: leadTrigger(),
  });

  log('\nTag:');
  if (!trigger && !APPLY) {
    log(`  would create  tags: ${TAG_NAME} (firing on "${TRIGGER_NAME}")`);
  } else {
    await upsert({
      kind: 'tags',
      workspace,
      existing: tags,
      name: TAG_NAME,
      body: leadTag(trigger.triggerId, measurementParam),
    });
  }

  // Key events are a GA4 property setting, not a GTM one. Marking them is what
  // turns a recorded event into something the reports can call a conversion.
  log('\nGA4 key events:');
  if (!(await hasScope(SCOPE_ANALYTICS_EDIT))) {
    log('  skipped: these credentials lack the analytics.edit scope.');
  } else {
    const current =
      (await googleFetch(`${ADMIN}/properties/${GA4_PROPERTY_ID}/keyEvents`, { label: 'key events' })).keyEvents ||
      [];
    const have = new Set(current.map((k) => k.eventName));
    for (const name of KEY_EVENTS) {
      if (have.has(name)) {
        log(`  already a key event  ${name}`);
        continue;
      }
      if (!APPLY) {
        log(`  would mark  ${name}`);
        continue;
      }
      try {
        await googleFetch(`${ADMIN}/properties/${GA4_PROPERTY_ID}/keyEvents`, {
          method: 'POST',
          body: { eventName: name, countingMethod: 'ONCE_PER_SESSION' },
          label: `mark key event ${name}`,
        });
        log(`  marked  ${name}`);
      } catch (err) {
        log(`  could not mark ${name}: ${err.message}`);
      }
    }
  }

  if (!PUBLISH) {
    log(
      APPLY
        ? '\nChanges are in the workspace but NOT live. Publish with:\n  node scripts/tracking-setup.mjs --publish\n'
        : '\nNothing was changed. Apply with:\n  node scripts/tracking-setup.mjs --apply\n'
    );
    return;
  }

  log('\nPublishing:');
  const version = await googleFetch(`${TM}/${workspace.path}:create_version`, {
    method: 'POST',
    body: { name: `Forward lead events to GA4 (${new Date().toISOString().slice(0, 10)})` },
    label: 'create version',
  });
  const v = version.containerVersion;
  if (!v) {
    log('  nothing to version: the workspace had no changes.');
    return;
  }
  await googleFetch(`${TM}/${v.path}:publish`, { method: 'POST', label: 'publish version' });
  log(`  published version ${v.containerVersionId}: ${v.name}`);
}

main().catch((err) => {
  if (err instanceof AuthError) {
    console.error(`\n${err.message}`);
    process.exit(2);
  }
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
});
