import React, { useMemo } from 'react';
import { registerRoute, registerSidebarEntry } from '@kinvolk/headlamp-plugin/lib';

import Pod from '@kinvolk/headlamp-plugin/lib/k8s/pod';
import Event from '@kinvolk/headlamp-plugin/lib/k8s/event';

import { CircularProgress } from '@mui/material';

function IncidentCenter() {
  const { items: pods, loading: podsLoading } = Pod.useList();
  const { items: events, loading: eventsLoading } = Event.useList();

  const loading = podsLoading || eventsLoading;

  // =========================
  // 🔥 FORMAT TIME (Since)
  // =========================

  const formatSince = (dateStr: string) => {
    if (!dateStr) return 'unknown';

    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  };

  // =========================
  // 🔥 CLASSIFIER
  // =========================

  const classifyIncident = (pod: any, podEvents: any[]) => {
    const name = pod?.metadata?.name;
    const namespace = pod?.metadata?.namespace;

    const containers = pod?.status?.containerStatuses || [];

const reason =
  containers
    ?.map(c =>
      c?.state?.waiting?.reason ||
      c?.state?.terminated?.reason
    )
    .find(Boolean) || pod?.status?.phase;

    // 🔴 IMAGE
    if (reason === 'ImagePullBackOff' || reason === 'ErrImagePull') {
      return {
        name,
        namespace,
        type: 'ImageIssue',
        severity: 'HIGH',
        rootCause: 'Container image cannot be pulled from registry',
        suggestion: 'Verify image name, tag, or registry authentication',
        events: podEvents,
      };
    }

    // 🔴 CRASH
    if (reason === 'CrashLoopBackOff') {
      return {
        name,
        namespace,
        type: 'CrashLoop',
        severity: 'HIGH',
        rootCause: 'Application is repeatedly crashing on startup',
        suggestion: 'Check logs: kubectl logs <pod>',
        events: podEvents,
      };
    }

    return null;
  };

  // =========================
  // 🔥 GROUPING ENGINE
  // =========================

const groupedIncidents = useMemo(() => {
  if (!pods || !events) return [];

  const map = new Map<string, any>();

  // ✅ index events une seule fois
  const eventsByPod = new Map<string, any[]>();

  for (const e of events) {
    const key = `${e?.involvedObject?.namespace}/${e?.involvedObject?.name}`;
    if (!eventsByPod.has(key)) eventsByPod.set(key, []);
    eventsByPod.get(key).push(e);
  }

  for (const pod of pods) {
    const name = pod?.metadata?.name;
    const namespace = pod?.metadata?.namespace;

    const podKey = `${namespace}/${name}`;
    const podEvents = eventsByPod.get(podKey) || [];

    const incident = classifyIncident(pod, podEvents);
    if (!incident) continue;

    const groupKey = incident.type;

    if (!map.has(groupKey)) {
      map.set(groupKey, {
        type: incident.type,
        severity: incident.severity,
        rootCause: incident.rootCause,
        suggestion: incident.suggestion,
        pods: [],
        events: [],
      });
    }

    const group = map.get(groupKey);

    group.pods.push({
      name: incident.name,
      namespace: incident.namespace,
    });

    group.events.push(...incident.events);
  }

  return Array.from(map.values()).map(group => {
    const sortedEvents = group.events
      .filter((e: any) => e?.message)
      .sort(
        (a: any, b: any) =>
          new Date(b.lastTimestamp || b.eventTime || 0).getTime() -
          new Date(a.lastTimestamp || a.eventTime || 0).getTime()
      );

    const lastError = sortedEvents[0]?.message || 'No recent error';

    const firstEventTime =
      sortedEvents[sortedEvents.length - 1]?.lastTimestamp ||
      sortedEvents[sortedEvents.length - 1]?.eventTime;

    return {
      ...group,
      count: group.pods.length,
      lastError,
      since: formatSince(firstEventTime),
    };
  });

}, [pods, events]);

  // =========================
  // 🔥 STATS
  // =========================

  const stats = useMemo(() => {
    return {
      high: groupedIncidents.filter(i => i.severity === 'HIGH').length,
      medium: groupedIncidents.filter(i => i.severity === 'MEDIUM').length,
      low: groupedIncidents.filter(i => i.severity === 'LOW').length,
    };
  }, [groupedIncidents]);

  // =========================
  // UI
  // =========================

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Incident Center</h1>
        <CircularProgress />
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Incident Center</h1>

      {/* STATS */}
      <div style={{ marginBottom: 20 }}>
        🔴 High: {stats.high} | 🟠 Medium: {stats.medium} | 🟢 Low: {stats.low}
      </div>

      {groupedIncidents.length === 0 ? (
        <p>✅ No incidents detected</p>
      ) : (
        groupedIncidents.map(group => (
          <div
            key={group.type}
            style={{
              padding: 16,
              marginBottom: 16,
              border: '1px solid #ddd',
              borderRadius: 10,
              background:
                group.severity === 'HIGH'
                  ? '#ffe5e5'
                  : group.severity === 'MEDIUM'
                  ? '#fff4e5'
                  : '#f5fff5',
            }}
          >
            <h3>
  {group.severity === 'HIGH' ? '🔴' :
   group.severity === 'MEDIUM' ? '🟠' : '🟢'}
  {' '}
  {group.type}
</h3>

            {/* ✅ COUNT + LIST */}
            <p>
              <b>Pods affected: ({group.count})</b>
            </p>

            <ul style={{ marginTop: 4 }}>
              {group.pods.map((p: any, i: number) => (
                <li key={i}>
                  {p.name} ({p.namespace})
                </li>
              ))}
            </ul>

            <p>
              <b>Root Cause: </b>
              {group.rootCause}
            </p>

            <p>
              <b>Last Error: </b>
              {group.lastError}
            </p>

            <p>
              <b>Since:</b> {group.since}
            </p>

            <p style={{ color: 'green' }}>
               Fix: {group.suggestion}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

// =========================
// REGISTER
// =========================

registerSidebarEntry({
  name: 'incident-center',
  label: 'Incident Center',
  url: '/incident-center',
  icon: 'mdi:bug',
});

registerRoute({
  path: '/incident-center',
  sidebar: 'incident-center',
  component: IncidentCenter,
});

export default IncidentCenter;