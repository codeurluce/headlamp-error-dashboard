import React, { useMemo } from 'react';
import { registerRoute, registerSidebarEntry } from '@kinvolk/headlamp-plugin/lib';

import Pod from '@kinvolk/headlamp-plugin/lib/k8s/pod';
import Event from '@kinvolk/headlamp-plugin/lib/k8s/event';

import { CircularProgress } from '@mui/material';

function KubernetesDebugAssistant() {
  const { items: pods, loading: podsLoading } = Pod.useList();
  const { items: events, loading: eventsLoading } = Event.useList();

  const loading = podsLoading || eventsLoading;

  // =========================
  // 🔥 FIXED SCHEDULING DETECTOR
  // =========================

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

  // =========================
  // 🔥 INCIDENT CLASSIFIER
  // =========================

  const classifyIncident = (pod: any, podEvents: any[]) => {
    const name = pod?.metadata?.name;
    const namespace = pod?.metadata?.namespace;

    const containers = pod?.status?.containerStatuses || [];

    const reason = containers?.[0]?.state?.waiting?.reason || pod?.status?.phase;

    let type = 'Unknown';
    let severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    let rootCause = 'Unknown issue';
    let suggestion = 'Check kubectl describe pod';

    // =========================
    // 🔥 IMAGE ISSUES
    // =========================

    if (reason === 'ImagePullBackOff' || reason === 'ErrImagePull') {
      type = 'ImageIssue';
      severity = 'HIGH';
      rootCause = 'Container image cannot be pulled';
      suggestion = 'Check image tag, registry credentials or image existence';
    }

    // =========================
    // 🔥 CRASH LOOP
    // =========================

    if (reason === 'CrashLoopBackOff') {
      type = 'CrashLoop';
      severity = 'HIGH';
      rootCause = 'Application is crashing repeatedly on startup';
      suggestion = 'Check logs: kubectl logs <pod>';
    }

    // =========================
    // 🔥 FIXED SCHEDULING (IMPORTANT CHANGE)
    // =========================

    if (isSchedulingIssue(podEvents)) {
      type = 'Scheduling';
      severity = 'MEDIUM';
      rootCause = 'Pod cannot be scheduled on a node';
      suggestion = 'Check node resources, PVCs or affinity rules';
    }

    // =========================
    // 🔥 FAILED POD
    // =========================

    if (pod?.status?.phase === 'Failed') {
      type = 'FailedPod';
      severity = 'HIGH';
      rootCause = 'Pod failed execution';
      suggestion = 'Inspect events and container logs';
    }

    return {
      id: `${namespace}-${name}`,
      name,
      namespace,
      type,
      severity,
      rootCause,
      suggestion,
      events: podEvents,
    };
  };

  // =========================
  // 🔥 CORRELATION ENGINE
  // =========================

  const incidents = useMemo(() => {
    if (!pods || !events) return [];

    const result: any[] = [];

    pods.forEach((pod: any) => {
      const name = pod?.metadata?.name;
      const namespace = pod?.metadata?.namespace;

      const podEvents = (events || []).filter(
        (e: any) => e?.involvedObject?.name === name && e?.involvedObject?.namespace === namespace
      );

      const containers = pod?.status?.containerStatuses || [];

      const hasError =
        pod?.status?.phase !== 'Running' || containers.some((c: any) => c?.state?.waiting?.reason);

      if (!hasError) return;

      result.push(classifyIncident(pod, podEvents));
    });

    return result;
  }, [pods, events]);

  // =========================
  // 🔥 STATS
  // =========================

  const stats = useMemo(() => {
    return {
      high: incidents.filter(i => i.severity === 'HIGH').length,
      medium: incidents.filter(i => i.severity === 'MEDIUM').length,
      low: incidents.filter(i => i.severity === 'LOW').length,
    };
  }, [incidents]);

  // =========================
  // UI
  // =========================

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Kubernetes Incident Center</h1>
        <CircularProgress />
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>🧠 Kubernetes Incident Center (Phase 2 Fixed)</h1>

      <div style={{ marginBottom: 20 }}>
        <p>
          🔴 High: {stats.high} | 🟠 Medium: {stats.medium} | 🟢 Low: {stats.low}
        </p>
      </div>

      {incidents.length === 0 ? (
        <p>✅ No incidents detected</p>
      ) : (
        incidents.map((i: any) => (
          <div
            key={i.id}
            style={{
              padding: 12,
              marginBottom: 12,
              border: '1px solid #ddd',
              borderRadius: 8,
              background:
                i.severity === 'HIGH' ? '#ffe5e5' : i.severity === 'MEDIUM' ? '#fff4e5' : '#f5fff5',
            }}
          >
            <h3>
              {i.severity === 'HIGH' ? '🔴' : i.severity === 'MEDIUM' ? '🟠' : '🟢'} {i.type}
            </h3>

            <p>
              <b>Pod:</b> {i.name} ({i.namespace})
            </p>

            <p>
              <b>Root Cause:</b> {i.rootCause}
            </p>

            <p>
              <b>Events:</b> {i.events.length}
            </p>

            <p style={{ color: 'green' }}>💡 Fix: {i.suggestion}</p>
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
