import { describe, expect, it, vi } from 'vitest';
import { sendVerificationEmail } from './email';

describe('verification email sender', () => {
  it('logs the verification link in development when Resend is not configured', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await sendVerificationEmail({
      to: 'user@example.com',
      verifyUrl: 'http://localhost:8787/api/auth/verify?token=abc',
      appUrl: 'http://localhost:5173',
      apiKey: ''
    });

    expect(info).toHaveBeenCalledWith(expect.stringContaining('http://localhost:8787/api/auth/verify?token=abc'));
    info.mockRestore();
  });

  it('sends a unique verification link through Resend when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }));

    await sendVerificationEmail({
      to: 'user@example.com',
      verifyUrl: 'https://yt2do.app/api/auth/verify?token=secret-token',
      appUrl: 'https://yt2do.app',
      apiKey: 're_test_key',
      from: 'YT2Do <verify@yt2do.app>',
      fetchImpl: fetchMock
    });

    expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer re_test_key' })
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual(['user@example.com']);
    expect(body.from).toBe('YT2Do <verify@yt2do.app>');
    expect(body.subject).toBe('Verify your YT2Do account');
    expect(body.html).toContain('https://yt2do.app/api/auth/verify?token=secret-token');
  });

  it('fails clearly when the email provider rejects the message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('provider rejected', { status: 403 }));

    await expect(sendVerificationEmail({
      to: 'user@example.com',
      verifyUrl: 'https://yt2do.app/api/auth/verify?token=secret-token',
      appUrl: 'https://yt2do.app',
      apiKey: 're_test_key',
      fetchImpl: fetchMock
    })).rejects.toThrow('Could not send verification email.');
  });
});
