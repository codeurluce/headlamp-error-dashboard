import React, { useMemo } from 'react';
import { registerRoute, registerSidebarEntry } from '@kinvolk/headlamp-plugin/lib';

import Pod from '@kinvolk/headlamp-plugin/lib/k8s/pod';
import Event from '@kinvolk/headlamp-plugin/lib/k8s/event';

import { CircularProgress } from '@mui/material';

function KubernetesDebugAssistant() {
  const { items: pods, loading: podsLoading } = Pod.useList();
  const { items: events, loading: eventsLoading } = Event.useList();

  const loading = podsLoading || eventsLoading;

  // =====================================================
  // 🔥 SCHEDULING DETECTOR
  // =====================================================

  const isSchedulingIssue = (podEvents: any[]) => {
    return podEvents.some((e: any) =>
      [
        'FailedScheduling',
        'Insufficient cpu',
        'Insufficient memory',
        '0/ nodes are available',
        'pod has unbound immediate PersistentVolumeClaims',
      ].some(keyword => (e?.message || e?.reason || '').includes(keyword))
    );
  };

  // =====================================================
  // 🔥 ROOT CAUSE CLASSIFIER (STRICT PRIORITY)
  // =====================================================

  const classifyIncident = (pod: any, podEvents: any[]) => {
    const name = pod?.metadata?.name;
    const namespace = pod?.metadata?.namespace;

    const containers = pod?.status?.containerStatuses || [];

    const reason =
      containers?.[0]?.state?.waiting?.reason ||
      containers?.[0]?.state?.terminated?.reason ||
      pod?.status?.phase;

    // 🧠 PRIORITY 1 — CONTAINER ERRORS

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

    // 🧠 PRIORITY 2 — POD STATE

    if (pod?.status?.phase === 'Failed') {
      return {
        name,
        namespace,
        type: 'FailedPod',
        severity: 'HIGH',
        rootCause: 'Pod execution failed',
        suggestion: 'Inspect logs and events',
        events: podEvents,
      };
    }

    if (pod?.status?.phase === 'Pending') {
      return {
        name,
        namespace,
        type: 'PendingPod',
        severity: 'MEDIUM',
        rootCause: 'Pod stuck in Pending state',
        suggestion: 'Check resources, PVC or node availability',
        events: podEvents,
      };
    }

    // 🧠 PRIORITY 3 — EVENTS

    if (isSchedulingIssue(podEvents)) {
      return {
        name,
        namespace,
        type: 'Scheduling',
        severity: 'MEDIUM',
        rootCause: 'Pod cannot be scheduled on a node',
        suggestion: 'Check node resources, affinity or PVC',
        events: podEvents,
      };
    }

    return null;
  };

  // =====================================================
  // 🔥 GROUPING ENGINE (ROOT CAUSE VIEW)
  // =====================================================

  const groupedIncidents = useMemo(() => {
    if (!pods || !events) return [];

    const map = new Map<string, any>();

    for (const pod of pods) {
      const name = pod?.metadata?.name;
      const namespace = pod?.metadata?.namespace;

      const podEvents = (events || []).filter(
        (e: any) => e?.involvedObject?.name === name && e?.involvedObject?.namespace === namespace
      );

      const incident = classifyIncident(pod, podEvents);

      if (!incident) continue;

      const key = incident.type; // 🔥 ROOT CAUSE GROUP KEY

      if (!map.has(key)) {
        map.set(key, {
          type: incident.type,
          severity: incident.severity,
          rootCause: incident.rootCause,
          suggestion: incident.suggestion,
          pods: [],
          totalEvents: 0,
        });
      }

      const group = map.get(key);

      group.pods.push({
        name: incident.name,
        namespace: incident.namespace,
      });

      group.totalEvents += incident.events.length;
    }

    return Array.from(map.values());
  }, [pods, events]);

  // =====================================================
  // 🔥 STATS (BASED ON GROUPS)
  // =====================================================

  const stats = useMemo(() => {
    return {
      high: groupedIncidents.filter(i => i.severity === 'HIGH').length,
      medium: groupedIncidents.filter(i => i.severity === 'MEDIUM').length,
      low: groupedIncidents.filter(i => i.severity === 'LOW').length,
    };
  }, [groupedIncidents]);

  // =====================================================
  // UI
  // =====================================================

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <h1>🧠 Kubernetes Incident Center</h1>
        <CircularProgress />
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>🧠 Root Cause View (PRO SRE MODE)</h1>

      {/* STATS */}
      <div style={{ marginBottom: 20 }}>
        🔴 High: {stats.high} | 🟠 Medium: {stats.medium} | 🟢 Low: {stats.low}
      </div>

      {/* INCIDENT GROUPS */}
      {groupedIncidents.length === 0 ? (
        <p>✅ No incidents detected</p>
      ) : (
        groupedIncidents.map(group => (
          <div
            key={group.type}
            style={{
              padding: 12,
              marginBottom: 12,
              border: '1px solid #ddd',
              borderRadius: 8,
              background:
                group.severity === 'HIGH'
                  ? '#ffe5e5'
                  : group.severity === 'MEDIUM'
                  ? '#fff4e5'
                  : '#f5fff5',
            }}
          >
            <h3>
              {group.severity === 'HIGH' ? '🔴' : group.severity === 'MEDIUM' ? '🟠' : '🟢'}{' '}
              {group.type}
            </h3>

            <p>
              <b>Pods impactés:</b>{' '}
              {group.pods.map((p: any) => `${p.name} (${p.namespace})`).join(', ')}
            </p>

            <p>
              <b>Root Cause:</b> {group.rootCause}
            </p>

            <p>
              <b>Total Events:</b> {group.totalEvents}
            </p>

            <p style={{ color: 'green' }}>💡 Fix: {group.suggestion}</p>
          </div>
        ))
      )}
    </div>
  );
}

// =====================================================
// REGISTER
// =====================================================

registerSidebarEntry({
  name: 'debug-assistant',
  label: 'Incident Center',
  url: '/debug-assistant',
  icon: 'mdi:bug',
});

registerRoute({
  path: '/debug-assistant',
  sidebar: 'debug-assistant',
  component: KubernetesDebugAssistant,
});

export default KubernetesDebugAssistant;
