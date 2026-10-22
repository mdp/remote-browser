import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

const dir = resolve(import.meta.dir, '..');
const compose: any = Bun.YAML.parse(await Bun.file(resolve(dir, 'compose.yaml')).text());
const kasmvnc: any = Bun.YAML.parse(await Bun.file(resolve(dir, 'kasmvnc.yaml')).text());
const dockerfile = await Bun.file(resolve(dir, 'Dockerfile.chrome')).text();

test('chrome is built from the pinned KasmVNC base image', () => {
  const chrome = compose.services.chrome;
  expect(chrome.image).toBeUndefined();
  expect(chrome.build.dockerfile).toBe('Dockerfile.chrome');
  expect(chrome.build.args.CHROME_BASE_IMAGE).toBe('kasmweb/chrome:1.19.0');
});

test('KasmVNC client is locked to local scaling with server resize disabled', () => {
  expect(dockerfile).toContain('initSetting("resize","remote")');
  expect(dockerfile).toContain('forceSetting("resize","scale")');
  expect(kasmvnc.desktop.allow_resize).toBe(false);
});

test('desktop name sets the browser tab title to remote-browser', () => {
  expect(kasmvnc.legacy.desktop_name).toBe('remote-browser');
});
