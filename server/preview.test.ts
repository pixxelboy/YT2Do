import { describe, expect, it } from 'vitest';
import { parseTargetMetadata } from './preview';

describe('parseTargetMetadata', () => {
  it('builds a preview from target page metadata without AI', () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="NeonBlade UI">
          <meta name="description" content="A polished Tailwind component library for futuristic dashboards and admin tools.">
          <meta property="og:image" content="/og.png">
          <link rel="icon" href="/favicon.svg">
        </head>
        <body><p>Fallback paragraph that should not win.</p></body>
      </html>
    `;

    const preview = parseTargetMetadata(html, 'https://neonbladeui.neuronrush.com/components', 'YT description line');

    expect(preview).toEqual({
      title: 'NeonBlade UI',
      description: 'A polished Tailwind component library for futuristic dashboards and admin tools.',
      image: 'https://neonbladeui.neuronrush.com/og.png',
      favicon: 'https://neonbladeui.neuronrush.com/favicon.svg',
      source: 'target-content'
    });
  });

  it('falls back to first paragraph when meta description is missing', () => {
    const preview = parseTargetMetadata(
      '<html><head><title>Docs</title></head><body><p>This documentation explains how to deploy the command line tool on macOS and Linux.</p></body></html>',
      'https://example.com/docs',
      'Docs link'
    );

    expect(preview.title).toBe('Docs');
    expect(preview.description).toContain('deploy the command line tool');
  });
});
