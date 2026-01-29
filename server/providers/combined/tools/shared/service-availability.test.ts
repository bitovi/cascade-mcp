import { describe, it, expect } from '@jest/globals';
import { formatServiceAvailabilityMessage } from './service-availability.js';

describe('formatServiceAvailabilityMessage', () => {
  it('should format single service (Atlassian only)', () => {
    expect(formatServiceAvailabilityMessage({ atlassian: true }))
      .toBe('Connected to Atlassian');
  });

  it('should format two services (Atlassian + Figma)', () => {
    expect(formatServiceAvailabilityMessage({ atlassian: true, figma: true }))
      .toBe('Connected to Figma and Atlassian');
  });

  it('should format two services (Atlassian + Google)', () => {
    expect(formatServiceAvailabilityMessage({ atlassian: true, google: true }))
      .toBe('Connected to Atlassian and Google Drive');
  });

  it('should format all three services with Oxford comma', () => {
    expect(formatServiceAvailabilityMessage({ atlassian: true, figma: true, google: true }))
      .toBe('Connected to Figma, Atlassian, and Google Drive');
  });

  it('should put Figma first when present (for Figma-centric tools)', () => {
    const message = formatServiceAvailabilityMessage({ atlassian: true, figma: true, google: true });
    const figmaIndex = message.indexOf('Figma');
    const atlassianIndex = message.indexOf('Atlassian');
    expect(figmaIndex).toBeLessThan(atlassianIndex);
  });

  it('should handle empty options (defaults to Atlassian)', () => {
    expect(formatServiceAvailabilityMessage({}))
      .toBe('Connected to Atlassian');
  });

  it('should handle all false (no services)', () => {
    expect(formatServiceAvailabilityMessage({ atlassian: false, figma: false, google: false }))
      .toBe('No services connected');
  });
});
