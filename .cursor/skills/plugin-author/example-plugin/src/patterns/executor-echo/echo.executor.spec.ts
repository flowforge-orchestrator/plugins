import { echoMetrics } from './echo.logic';

describe('echoMetrics', () => {
  it('trims and returns length', () => {
    expect(echoMetrics('  hi  ')).toEqual({ text: 'hi', length: 2 });
  });

  it('empty string has length 0', () => {
    expect(echoMetrics('   ')).toEqual({ text: '', length: 0 });
  });
});
