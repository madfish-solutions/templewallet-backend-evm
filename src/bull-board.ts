import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { ensureLoggedIn } from 'connect-ensure-login';
import { Express } from 'express-serve-static-core';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import path from 'path';

import { alchemyRequestsQueue } from './api-router/alchemy';
import { covalentRequestsQueue } from './api-router/covalent';
import { EnvVars } from './config';

passport.use(
  new LocalStrategy(function (username, password, cb) {
    if (username === EnvVars.ADMIN_USERNAME && password === EnvVars.ADMIN_PASSWORD) {
      return cb(null, { user: 'admin' });
    }

    return cb(null, false);
  })
);

passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser<string>((user, cb) => {
  cb(null, user);
});

export const setupBullBoard = (app: Express) => {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/ui');

  app.set('views', path.join(__dirname, '../views'));
  app.set('view engine', 'ejs');

  createBullBoard({
    queues: [covalentRequestsQueue, alchemyRequestsQueue].map(queue => new BullMQAdapter(queue)),
    serverAdapter
  });

  app.use(passport.initialize({}));
  app.use(passport.session());

  app.get('/ui/login', (req, res) => {
    res.render('login', { invalid: req.query.invalid === 'true' });
  });

  app.post('/ui/login', passport.authenticate('local', { failureRedirect: '/ui/login?invalid=true' }), (_req, res) => {
    res.redirect('/ui');
  });

  app.use('/ui', ensureLoggedIn({ redirectTo: '/ui/login' }), serverAdapter.getRouter());
};
