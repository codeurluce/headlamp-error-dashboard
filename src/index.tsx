import React, { useEffect, useState } from 'react';
import { registerRoute, registerSidebarEntry, K8s } from '@kinvolk/headlamp-plugin/lib';

import { Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';

function ErrorDashboard() {
  const [pods, setPods] = useState<any[]>([]);

  useEffect(() => {
    async function loadPods() {
      try {
        const Pod = K8s.cluster().makeKubeObject('pods');
        const list = await Pod.list();
        setPods(list.items || []);
      } catch (err) {
        console.error('Error loading pods:', err);
      }
    }

    loadPods();
  }, []);

  const errorPods = pods.filter((pod: any) => {
    const containers = pod.status?.containerStatuses || [];

    return containers.some((c: any) => {
      const reason = c.state?.waiting?.reason;
      return reason === 'CrashLoopBackOff' || reason === 'Error' || reason === 'ImagePullBackOff';
    });
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
          {errorPods.map((pod: any) => {
            const container = pod.status?.containerStatuses?.[0];

            return (
              <TableRow key={pod.metadata.uid}>
                <TableCell>{pod.metadata.name}</TableCell>
                <TableCell>{pod.metadata.namespace}</TableCell>
                <TableCell>{container?.state?.waiting?.reason || 'Running'}</TableCell>
                <TableCell>{container?.restartCount || 0}</TableCell>
              </TableRow>
            );
          })}
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
