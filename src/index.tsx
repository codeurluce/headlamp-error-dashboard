import React, { useEffect, useState } from 'react';
import { registerRoute, registerSidebarEntry, K8s } from '@kinvolk/headlamp-plugin/lib';

import { Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';

function ErrorDashboard() {
  const [pods, setPods] = useState<any[]>([]);

  const loadPods = async () => {
    try {
      const Pod = K8s.cluster().makeKubeObject('pods');
      const list = await Pod.list();
      setPods(list.items || []);
    } catch (err) {
      console.error('Error loading pods:', err);
    }
  };

  useEffect(() => {
    loadPods();

    // refresh auto (important pour un dashboard)
    const interval = setInterval(loadPods, 5000);
    return () => clearInterval(interval);
  }, []);

  // 🔴 détection robuste des erreurs container
  const isContainerInError = (c: any) => {
    const state = c?.state;

    const reason = state?.waiting?.reason || state?.terminated?.reason || state?.running?.reason;

    const errorReasons = [
      'CrashLoopBackOff',
      'ImagePullBackOff',
      'ErrImagePull',
      'Error',
      'OOMKilled',
    ];

    return errorReasons.includes(reason);
  };

  // 🔴 filtre pods en erreur (multi-containers safe)
  const errorPods = pods.filter((pod: any) => {
    const containers = pod.status?.containerStatuses || [];
    return containers.some(isContainerInError);
  });

  return (
    <div style={{ padding: 20 }}>
      <h1>Error Dashboard</h1>

      <Table
        size="small"
        sx={theme => ({
          '& .MuiTableHead-root': {
            backgroundColor: theme.palette.background.default,
          },
          '& .MuiTableCell-head': {
            fontWeight: 600,
            color: theme.palette.text.secondary,
          },
          '& .MuiTableRow-root:hover': {
            backgroundColor: theme.palette.action.hover,
          },
        })}
      >
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
                No error pods detected
              </TableCell>
            </TableRow>
          ) : (
            errorPods.map((pod: any) => {
              const containers = pod.status?.containerStatuses || [];

              // prend le premier container en erreur (si plusieurs)
              const failingContainer = containers.find(isContainerInError);

              const state = failingContainer?.state;
              const reason = state?.waiting?.reason || state?.terminated?.reason || 'Unknown';

              const restartCount = containers.reduce(
                (acc: number, c: any) => acc + (c?.restartCount || 0),
                0
              );

              return (
                <TableRow key={pod.metadata.uid}>
                  <TableCell>{pod.metadata.name}</TableCell>
                  <TableCell>{pod.metadata.namespace}</TableCell>
                  <TableCell>{reason}</TableCell>
                  <TableCell>{restartCount}</TableCell>
                </TableRow>
              );
            })
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
