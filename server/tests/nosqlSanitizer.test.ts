import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('NoSQL Injection Sanitization Middleware', () => {
  const app = createApp();

  it('allows benign request bodies with standard fields', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    // Should reach the auth controller (which returns 401 for non-existent user), NOT 400 NoSQL rejection
    expect(res.status).not.toBe(400);
  });

  it('rejects operator injection {"$gt": ""} in request body with 400', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({
        email: { $gt: '' },
        password: 'password123'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
    expect(res.body.message).toMatch(/Invalid characters or operator keys/);
  });

  it('rejects operator injection {"$ne": null} in request body with 400', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({
        email: 'admin@aicte.gov.in',
        password: { $ne: null }
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
  });

  it('rejects nested keys containing dot notation (e.g. user.role) with 400', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({
        'user.role': 'ADMIN',
        password: 'secret'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
  });
});
