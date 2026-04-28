import React from 'react';
import { registerRoute, registerSidebarEntry } from '@kinvolk/headlamp-plugin/lib';

import Pod from '@kinvolk/headlamp-plugin/lib/k8s/pod';

import { Table, TableHead, TableRow, TableCell, TableBody, CircularProgress } from '@mui/material';

function ErrorDashboard() {
  // 🔥 THIS IS THE REAL OVERVIEW WAY
  const { items: pods, loading, error } = Pod.useList();

  const isPodInError = (pod: any) => {
    const phase = pod?.status?.phase;

    // 🔴 IMPORTANT: Overview inclut Pending + Failed
    if (['Failed', 'Unknown', 'Pending'].includes(phase)) return true;

    // containers
    const containers = pod?.status?.containerStatuses || [];

    const containerError = containers.some((c: any) => {
      const reason = c?.state?.waiting?.reason || c?.state?.terminated?.reason;

      return [
        'CrashLoopBackOff',
        'ImagePullBackOff',
        'ErrImagePull',
        'Error',
        'OOMKilled',
      ].includes(reason);
    });

    // init containers (🔥 IMPORTANT)
    const initContainers = pod?.status?.initContainerStatuses || [];

    const initError = initContainers.some((c: any) => {
      const reason = c?.state?.waiting?.reason || c?.state?.terminated?.reason;

      return reason !== undefined;
    });

    return containerError || initError;
  };

  const errorPods = (pods || []).filter(isPodInError).map((pod: any) => {
    const containers = pod?.status?.containerStatuses || [];

    const reason =
      containers?.[0]?.state?.waiting?.reason ||
      containers?.[0]?.state?.terminated?.reason ||
      pod?.status?.phase ||
      'Unknown';

    const restarts = containers.reduce((acc: number, c: any) => acc + (c?.restartCount || 0), 0);

    return {
      uid: pod.metadata?.uid,
      name: pod.metadata?.name,
      namespace: pod.metadata?.namespace,
      reason,
      restarts,
    };
  });

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Error Dashboard 🚀</h1>
        <CircularProgress />
      </div>
    );
  }

  if (error) {
    return <p style={{ color: 'red' }}>Error loading pods</p>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Error Dashboard 🚀</h1>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Pod</TableCell>
            <TableCell>Namespace</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Restarts</TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {errorPods.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} align="center">
                ✅ Aucun pod en erreur
              </TableCell>
            </TableRow>
          ) : (
            errorPods.map((pod: any) => (
              <TableRow key={pod.uid}>
                <TableCell>{pod.name}</TableCell>
                <TableCell>{pod.namespace}</TableCell>
                <TableCell>{pod.reason}</TableCell>
                <TableCell>{pod.restarts}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

registerSidebarEntry({
  name: 'error-dashboard',
  label: 'Error Dashboard',
  url: '/error-dashboard',
  icon: 'mdi:alert-octagon',
});

registerRoute({
  path: '/error-dashboard',
  sidebar: 'error-dashboard',
  component: ErrorDashboard,
});

export default ErrorDashboard;
