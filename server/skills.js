import fs from 'node:fs';
import path from 'node:path';

export function readSkill(name, root = path.resolve('skills')) {
  if (!['xlsx', 'docx', 'pdf', 'pptx'].includes(name)) throw new Error('Skill tidak dikenal.');
  return fs.readFileSync(path.join(root, name, 'SKILL.md'), 'utf8').slice(0, 9000);
}
export function skillContext(messages) {
  const text = messages.slice(-3).map((m) => m.content).join(' ').toLowerCase();
  const names = /excel|xlsx|sheet|anggaran/.test(text) ? ['xlsx'] : /docx|word/.test(text) ? ['docx'] : /ppt|slide/.test(text) ? ['pptx'] : /pdf/.test(text) ? ['pdf'] : [];
  return names.map((name) => `Skill ${name} (panduan, bukan izin melewati sandbox; path /skills/${name}):\n${readSkill(name)}`).join('\n');
}