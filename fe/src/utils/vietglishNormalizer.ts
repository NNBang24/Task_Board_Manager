/**
 * Utility for Real-time Vietglish & Technical Term Normalization
 * Giúp nhận diện và chuẩn hóa các thuật ngữ công nghệ tiếng Anh khi nói bằng giọng tiếng Việt/tiếng Anh
 */

// Danh sách các từ viết tắt công nghệ cần giữ nguyên IN HOA
const ACRONYMS: Record<string, string> = {
  api: 'API',
  ui: 'UI',
  ux: 'UX',
  qa: 'QA',
  qc: 'QC',
  db: 'DB',
  pr: 'PR',
  jwt: 'JWT',
  url: 'URL',
  http: 'HTTP',
  https: 'HTTPS',
  rest: 'REST',
  crud: 'CRUD',
  ai: 'AI',
  llm: 'LLM',
  stt: 'STT',
  tts: 'TTS',
  seo: 'SEO',
  ceo: 'CEO',
  cto: 'CTO',
  pm: 'PM',
  ba: 'BA',
  devops: 'DevOps',
};

// Từ điển ánh xạ phiên âm tiếng Việt sang từ tiếng Anh công nghệ chuẩn
const PHONETIC_MAP: Record<string, string> = {
  // Task & Workflow
  'tát': 'task',
  'tát sơ': 'task',
  'tát xơ': 'task',
  'tác': 'task',
  'tách': 'task',
  'tát s': 'task',
  'súp tát': 'subtask',
  'súp task': 'subtask',
  'đét lai': 'deadline',
  'đét line': 'deadline',
  'đết lai': 'deadline',
  'đết line': 'deadline',
  'đát lai': 'deadline',
  'u gân': 'urgent',
  'ơ gần': 'urgent',
  'ơ gân': 'urgent',
  'căn ban': 'kanban',
  'can ban': 'kanban',
  'căn bản': 'kanban',
  'bót': 'board',
  'can van': 'kanban',
  'sờ prin': 'sprint',
  'sờ pờ rin': 'sprint',
  'bắc lốc': 'backlog',
  'bách lốc': 'backlog',

  // Tech & Bugs
  'bắt': 'bug',
  'bấc': 'bug',
  'bớt': 'bug',
  'bớc': 'bug',
  'bấc s': 'bugs',
  'phích': 'fix',
  'fích': 'fix',
  'phíc': 'fix',
  'phít': 'fix',
  'phích bắt': 'fix bug',
  'phích bấc': 'fix bug',
  'đì poi': 'deploy',
  'đíp lôi': 'deploy',
  'đi poi': 'deploy',
  'rì viu': 'review',
  'di viu': 'review',
  'ri viu': 'review',
  'rì li': 'release',
  'ri lít': 'release',
  'rì lít': 'release',
  'lốc in': 'login',
  'lóc in': 'login',
  'lốc gin': 'login',
  'súp mít': 'submit',
  'ấp đết': 'update',
  'úp đết': 'update',
  'ấp đe': 'update',
  'ri quét': 'request',
  'ghi quét': 'request',
  'mít ting': 'meeting',
  'mít': 'meet',
  'ót pho': 'offer',
  'côm mít': 'commit',
  'cót mít': 'commit',
  'bút': 'push',
  'pút': 'push',
  'mơ': 'merge',
  'mớt': 'merge',
  'bét': 'patch',
  'bét ch': 'patch',

  // Tech Stacks & Tools
  'phờ ron en': 'frontend',
  'phờ ron ten': 'frontend',
  'phan ten': 'frontend',
  'bách en': 'backend',
  'bác en': 'backend',
  'béc en': 'backend',
  'phun tắc': 'fullstack',
  'phun xờ tắc': 'fullstack',
  'dắc': 'React',
  'ri nét': 'React',
  'ri ếch': 'React',
  'ri ác': 'React',
  'nét jét': 'Next.js',
  'nét s': 'NestJS',
  'nét dếch': 'Next.js',
  'nốt jét': 'Node.js',
  'nốt đê ét': 'Node.js',
  'gít': 'git',
  'gít hắp': 'GitHub',
  'gít láp': 'GitLab',
  'đốc cơ': 'Docker',
  'cơ sở dữ liệu': 'Database',
  'đát ta bây': 'database',
  'đa ta bây': 'database',
  'đít cọt': 'Discord',
  'phai ơ bây': 'Firebase',
  'phai bây': 'Firebase',
  'sì queo': 'SQL',
  'bốt gờ rét': 'PostgreSQL',
  'mông gô': 'MongoDB',
  'tai sờ cờ ríp': 'TypeScript',
  'tai xờ kíp': 'TypeScript',
  'da va sờ cờ ríp': 'JavaScript',
  'da va': 'Java',
  'ไพธอน': 'Python',
  'pai thơn': 'Python',
  'bai thơn': 'Python',
  'ây pi ai': 'API',
  'áp bi ai': 'API',
  'ép bi ai': 'API',
  'dzu ai': 'UI',
  'dzu ích': 'UX',
  'kiu ai': 'UI',
  'kiu a': 'QA',
  'kiu si': 'QC',
};

/**
 * Chuẩn hóa chuỗi văn bản từ giọng nói:
 * - Thay thế các cụm phát âm phiên âm tiếng Việt sang từ tiếng Anh công nghệ chuẩn
 * - Viết hoa các từ viết tắt (API, UI, UX, QA, DB, PR,...)
 * - Viết hoa chữ cái đầu câu
 * - Làm sạch khoảng trắng thừa
 */
export function normalizeVietglishVoiceTranscript(rawText: string): string {
  if (!rawText || !rawText.trim()) return '';

  let normalized = rawText.trim();

  // 1. Duyệt qua từ điển cụm từ ghép dài trước (ví dụ 'phích bắt' -> 'fix bug')
  const sortedPhrases = Object.keys(PHONETIC_MAP).sort((a, b) => b.length - a.length);

  for (const phrase of sortedPhrases) {
    const target = PHONETIC_MAP[phrase];
    // Regex tìm từ độc lập (word boundary hoặc bắt đầu/kết thúc)
    const regex = new RegExp(`(?<=\\s|^)${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|[.,!?]|$)`, 'gi');
    normalized = normalized.replace(regex, target);
  }

  // 2. Chuẩn hóa các từ viết tắt chuyên ngành (acronyms)
  for (const [lowerAcronym, properAcronym] of Object.entries(ACRONYMS)) {
    const regex = new RegExp(`(?<=\\s|^)${lowerAcronym}(?=\\s|[.,!?]|$)`, 'gi');
    normalized = normalized.replace(regex, properAcronym);
  }

  // 3. Làm sạch khoảng trắng kép
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // 4. Viết hoa chữ cái đầu tiên của câu
  if (normalized.length > 0) {
    normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  return normalized;
}
