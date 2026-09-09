import Docker from 'dockerode';

// ponytail: single default socket, add host/TLS options if remote daemons matter
export const docker = new Docker({ socketPath: '/var/run/docker.sock' });
