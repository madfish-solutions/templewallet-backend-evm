import { Server } from 'http';

import { setupServer } from './server';

let server: Server | undefined;

export const mochaGlobalSetup = async () => {
  server = await setupServer();
  console.log('Global setup complete!');
};

export const mochaGlobalTeardown = async () => {
  await new Promise<void>(resolve => {
    if (server) {
      server.unref();
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
  console.log('Global teardown complete!');
};
