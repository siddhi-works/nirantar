import { beforeAll, describe, expect, it } from 'vitest';
import { setup, P1_ABHA, type Harness } from './test-utils';

let h: Harness;
beforeAll(async () => { h = await setup(); }, 60_000);

// a few hundred bytes that start like a JPEG; the route checks the signature, not that it decodes
const jpegBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]);
const asUrl = (b: Buffer, mime = 'image/jpeg') => `data:${mime};base64,${b.toString('base64')}`;

describe('profile photos', () => {
  it('needs a sign-in, accepts only a real small JPEG, and keeps it per person and per space', async () => {
    expect((await h.req('PUT', '/me/photo', { image: asUrl(jpegBytes) })).status).toBe(401);
    expect((await h.get('/me/photo')).status).toBe(401);

    const doctor = await h.doctor('f1f1f1f1f1f1');
    expect((await h.get('/me/photo', doctor)).status).toBe(404);
    expect(((await (await h.get('/auth/me', doctor)).json()).user).photoVersion).toBeUndefined();

    // wrong kinds are refused: another type, a text file dressed as a JPEG, an oversized picture
    expect((await h.req('PUT', '/me/photo', { image: asUrl(jpegBytes, 'image/svg+xml') }, doctor)).status).toBe(400);
    expect((await h.req('PUT', '/me/photo', { image: asUrl(Buffer.from('<script>alert(1)</script>'.repeat(30))) }, doctor)).status).toBe(400);
    expect((await h.req('PUT', '/me/photo', { image: asUrl(Buffer.concat([jpegBytes, Buffer.alloc(200_000, 1)])) }, doctor)).status).toBe(400);

    const ok = await h.req('PUT', '/me/photo', { image: asUrl(jpegBytes) }, doctor);
    expect(ok.status, JSON.stringify(await ok.clone().json())).toBe(200);
    const res = await h.get('/me/photo', doctor);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await res.arrayBuffer()).equals(jpegBytes)).toBe(true);
    expect(((await (await h.get('/auth/me', doctor)).json()).user).photoVersion).toBe((await ok.json()).version);

    // not shared with another person, or with the same sign-in in another tester space
    expect((await h.get('/me/photo', await h.patient(P1_ABHA, 'f1f1f1f1f1f1'))).status).toBe(404);
    expect((await h.get('/me/photo', await h.doctor('f2f2f2f2f2f2'))).status).toBe(404);

    expect((await h.req('DELETE', '/me/photo', {}, doctor)).status).toBe(200);
    expect((await h.get('/me/photo', doctor)).status).toBe(404);
  });
});
