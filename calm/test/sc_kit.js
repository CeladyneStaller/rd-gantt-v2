/* Kit behaviour shared by every board: autosave timing, sheet dismissal, dialogs, toasts, read-only guard. */
const { Sim, done } = require('./dc');
const file = process.argv[2] || 'out/Main.dc.html';
const s = new Sim(file);
if (s.c.APP !== 'plan') s.step('autosave: 700 ms after the last change, never later than 2.5 s after the first (Planning saves every edit on its own model)', () => {
  for (let i = 0; i < 7; i++) { s.c.mutate((D) => { D.version++; }); if (i < 6) s.advance(400); }
  s.eq('still saving while edits keep coming', s.c.state.save.state, 'saving');
  s.advance(100);
  s.eq('saved at the 2.5 s cap', s.c.state.save.state, 'saved');
  s.c.mutate(() => {});
  s.advance(699); s.eq('not before 700 ms', s.c.state.save.state, 'saving');
  s.advance(1); s.eq('700 ms after the last change', s.c.state.save.state, 'saved');
});
s.step('sheets: dismissing asks only when the draft changed', () => {
  s.c.openSheet('test.one', {}, { a: '1' }); s.render();
  s.eq('clean sheet is not dirty', s.c.sheetDirty(s.c.sheet()), false);
  s.c.dismissSheet(); s.render();
  s.eq('clean sheet closes at once', s.c.state.sheets.length, 0);
  s.c.openSheet('test.one', {}, { a: '1' }); s.c.setDraft({ a: '2' }); s.render();
  s.eq('edited sheet is dirty', s.c.sheetDirty(s.c.sheet()), true);
  s.c.dismissAll(); s.render();
  s.expect('Discard your changes?', 'asks before discarding');
  s.click('Cancel', { within: 'Discard your changes?' });
  s.eq('cancel keeps the sheet', s.c.state.sheets.length, 1);
  s.c.dismissAll(); s.render(); s.click('Discard changes');
  s.eq('discard closes every sheet', s.c.state.sheets.length, 0);
  s.c.openSheet('test.one', { d0: JSON.stringify({ a: '2' }) }, { a: '1' }); s.c.setDraft({ a: '2' }); s.render();
  s.eq('a module baseline (data.d0) wins', s.c.sheetDirty(s.c.sheet()), false);
  s.c.closeAllSheets(); s.render();
  const ev = { key: 'Escape', defaultPrevented: true };
  s.c.openSheet('test.one', {}, {}); s.render();
  s.vals.ui.sheetKey(ev); s.render();
  s.eq('Escape already handled by a field leaves the sheet', s.c.state.sheets.length, 1);
  s.vals.ui.sheetKey({ key: 'Escape', preventDefault() {} }); s.render();
  s.eq('Escape closes a clean sheet', s.c.state.sheets.length, 0);
});
s.step('dialogs, toasts and the read-only guard', () => {
  let got = null;
  s.c.ask({ title: 'Name the tree', label: 'Name', value: '', ok: 'Create', onOk: (v) => (v.trim() ? (got = v, '') : 'Give it a name.') }); s.render();
  s.click('Create'); s.expect('Give it a name.', 'ask keeps the dialog open with the error');
  s.type('Name', 'Cell 7 outlier'); s.click('Create');
  s.eq('ask returns the value', got, 'Cell 7 outlier');
  s.eq('dialog closed', s.c.state.dlg, null);
  s.c.toast('Hello there.', 'ok'); s.render(); s.expect('Hello there.');
  s.advance(4300); s.expectNot('Hello there.', 'toasts hide on their own');
  s.c.setState({ ro: true }); s.render();
  const ok = s.c.mutate((D) => { D.version = -1; });
  s.render();
  s.eq('mutate refuses in read-only', [ok, s.c.D.version === -1], [false, false]);
  s.expect('Read-only view — editing is disabled.');
});
s.clean('kit');
done();
