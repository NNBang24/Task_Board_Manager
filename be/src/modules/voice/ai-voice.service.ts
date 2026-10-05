import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VoiceLogStatus, TaskPriority, TaskStatus } from '@prisma/client';
import { SocketGateway } from '../socket/socket.gateway';
import { NotificationService } from '../notification/notification.service';
import OpenAI, { toFile } from 'openai';

export interface AiTaskResult {
  title?: string;
  description?: string | null;
  priority?: string;
  projectName?: string | null;
  assigneeEmail?: string | null;
  assigneeName?: string | null;
  dueDate?: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
}

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
}

export interface TaskAssigneeInfo {
  id: string;
  fullName: string;
  email: string;
  avatar: string | null;
  profession: string;
}

export interface TaskCreatorInfo {
  id: string;
  fullName: string;
  email: string;
  avatar: string | null;
}

export interface SubtaskAssigneeInfo {
  id: string;
  fullName: string;
  avatar: string | null;
}

export interface VoiceSubtaskItem {
  id: string;
  taskId: string;
  title: string;
  isDone: boolean;
  isUrgent: boolean;
  order: number;
  assignee?: SubtaskAssigneeInfo | null;
}

export interface VoiceCreatedTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  startDate: Date | null;
  dueDate: Date | null;
  projectId: string;
  assigneeId: string | null;
  createdById: string;
  rawVoice: string | null;
  stageId: string | null;
  createdAt: Date;
  updatedAt: Date;
  project?: {
    id: string;
    name: string;
  };
  assignee?: TaskAssigneeInfo | null;
  createdBy?: TaskCreatorInfo;
  tags?: Array<{
    tag: {
      id: string;
      name: string;
      color: string | null;
    };
  }>;
  subtasks?: VoiceSubtaskItem[];
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
    type: string;
  }>;
}

export interface VoiceParseResponse {
  rawAudioText: string;
  parsedData: {
    title: string;
    description: string | null;
    priority: TaskPriority;
    projectId: string;
    projectName: string;
    assigneeId: string;
    assigneeName: string;
    assigneeEmail: string;
    dueDate: string | null;
  };
  projects: Array<{ id: string; name: string }>;
  users: Array<{ id: string; fullName: string; email: string; avatar: string | null; profession: string }>;
}

export interface ConfirmVoiceTaskPayload {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  projectId: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  rawVoice?: string | null;
}

export interface VoiceTaskCreationResponse {
  success: boolean;
  message: string;
  task: VoiceCreatedTask;
  parsedData: AiTaskResult;
}

@Injectable()
export class AiVoiceService {
  private groq: OpenAI | null = null;
  private cachedModel: string | null = null;
  constructor(
    private prisma: PrismaService,
    private socketGateway: SocketGateway,
    private notificationService: NotificationService
  ) {
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey) {
      this.groq = new OpenAI({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });
    }
  }

  private getGroqClient(): OpenAI | null {
    if (!this.groq) {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        return null;
      }
      this.groq = new OpenAI({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });
    }
    return this.groq;
  }

  /**
   * Boc bang giong noi sang van ban bang Groq Whisper.
   */
  /**
   * Boc bang giong noi sang van ban bang Groq Whisper (whisper-large-v3 / whisper-large-v3-turbo).
   */
  async transcribeAudioFile(
    fileBuffer: Buffer,
    filename: string = 'voice-command.webm',
    language?: string
  ): Promise<string> {
    const groqClient = this.getGroqClient();
    if (!groqClient) {
      throw new BadRequestException(
        'Chưa cấu hình GROQ_API_KEY trong hệ thống Backend. Vui lòng cấu hình biến môi trường GROQ_API_KEY.'
      );
    }

    const candidateModels = ['whisper-large-v3', 'whisper-large-v3-turbo'];
    let lastError: string | null = null;

    const bilingualPrompt =
      'Solaris AI Task Assistant. Trợ lý tạo công việc thông minh. Nhận diện chuẩn xác Tiếng Việt và Tiếng Anh công nghệ IT: Task, Subtask, Kanban, Deadline, Assignee, Project, Urgent, Important, Normal, Low, Fix bug, Deploy, Review PR, Auth, Database, UI/UX, Hôm nay, Ngày mai, Tuần sau...';

    for (const modelName of candidateModels) {
      try {
        const audioFile = await toFile(fileBuffer, filename);
        const requestParams: OpenAI.Audio.Transcriptions.TranscriptionCreateParams = {
          file: audioFile,
          model: modelName,
          prompt: bilingualPrompt,
          temperature: 0.0,
        };

        if (language && (language === 'vi' || language === 'en')) {
          requestParams.language = language;
        }

        const transcription = await groqClient.audio.transcriptions.create(requestParams);
        const text = transcription?.text?.trim() || '';
        if (text) {
          return text;
        }
      } catch (modelErr: unknown) {
        lastError = modelErr instanceof Error ? modelErr.message : String(modelErr);
        console.warn(`Groq Whisper model ${modelName} encountered error: ${lastError}. Đang thử model tiếp theo...`);
      }
    }

    if (lastError) {
      console.error('Tất cả model Groq Whisper đều gặp lỗi:', lastError);
      throw new InternalServerErrorException(`Lỗi nhận diện âm thanh qua Groq Whisper: ${lastError}`);
    }

    throw new BadRequestException('Không nhận diện được giọng nói trong đoạn âm thanh tải lên.');
  }

  /**
   * Nhan file am thanh, boc bang bang Whisper va tao task qua LLaMA.
   */
  async processVoiceAudioTaskCreation(
    userId: string,
    fileBuffer: Buffer,
    filename: string = 'voice-command.webm'
  ): Promise<VoiceTaskCreationResponse> {
    const rawAudioText = await this.transcribeAudioFile(fileBuffer, filename);
    return await this.processVoiceTaskCreation(userId, rawAudioText);
  }

  /**
   * Phan tich van ban khau lenh thanh du lieu cong viec co cau truc de hien thi buoc xac nhan.
   */
  async parseVoiceText(userId: string, rawAudioText: string, currentProjectId?: string): Promise<VoiceParseResponse> {
    const projects = await this.prisma.project.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!projects || projects.length === 0) {
      throw new NotFoundException(
        'He thong chua co du an nao. Vui long tao it nhat 1 du an truoc khi su dung tro ly giong noi.'
      );
    }

    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, email: true, fullName: true, avatar: true, profession: true },
      orderBy: { fullName: 'asc' },
    });

    const now = new Date();
    const groqClient = this.getGroqClient();

    let aiResult: AiTaskResult = {
      title: rawAudioText.slice(0, 100),
      priority: 'NORMAL',
    };

    if (groqClient) {
      const todayStr = now.toISOString().split('T')[0];
      const currentDayOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][
        now.getDay()
      ];

      const prompt = `
Bạn là trợ lý ảo AI thông minh đa ngôn ngữ Solaris AI, có khả năng hiểu sâu sắc khẩu lệnh Song ngữ (Tiếng Việt, Tiếng Anh và Vietglish/thuật ngữ kỹ thuật IT) của người dùng để trích xuất thông tin tạo Task (Công việc).

Thời điểm hiện tại: ${todayStr} (${currentDayOfWeek}).

Danh sách Dự án đang có trong hệ thống:
${JSON.stringify(projects.map((p) => ({ id: p.id, name: p.name })))}

Danh sách Thành viên đang có trong hệ thống:
${JSON.stringify(users.map((u) => ({ id: u.id, email: u.email, fullName: u.fullName })))}

Câu lệnh giọng nói của người dùng:
"${rawAudioText}"

Hãy phân tích kỹ câu lệnh và trả về JSON thuần túy (không kèm bất kỳ văn bản giải thích hoặc code block nào) với cấu trúc sau:
{
  "title": "Chỉ chứa nội dung/hành động chính của công việc (Ví dụ: 'Fix bug API Authentication', 'Thiết kế Banner Marketing', 'Tối ưu hiệu năng Database'). Tuyệt đối KHÔNG gộp các từ khóa 'cho Nam', 'mức độ khẩn cấp', 'deadline ngày mai' vào title.",
  "description": "Mô tả chi tiết nội dung công việc nếu người dùng có nói, hoặc null",
  "priority": "LOW" | "NORMAL" | "IMPORTANT" | "URGENT",
  "projectName": "Tên dự án trong danh sách khớp nhất với câu lệnh, hoặc null",
  "assigneeEmail": "Email của thành viên trong danh sách được nhắc đến (ví dụ: 'giao cho Nam', 'for Sarah', 'cho An'), hoặc null",
  "assigneeName": "Tên thành viên nếu có (ví dụ: 'Nam', 'Alex', 'Sarah'), hoặc null",
  "dueDate": "YYYY-MM-DD nếu có thời hạn (ví dụ: 'ngày mai'/'tomorrow' -> tính toán ngày tiếp theo từ hôm nay ${todayStr}, 'thứ hai tuần sau'/'next week', 'cuối tuần'/'weekend'), hoặc null"
}
`.trim();

      const candidateModels = [
        await this.resolveGroqModel(groqClient),
        'openai/gpt-oss-120b',
        'llama-3.3-70b-versatile',
        'openai/gpt-oss-20b',
        'qwen/qwen3.8-27b',
        'allam-2-7b',
      ];
      const uniqueCandidates = Array.from(new Set(candidateModels));

      for (const modelToTry of uniqueCandidates) {
        try {
          const completion = await groqClient.chat.completions.create({
            model: modelToTry,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
          });
          if (completion?.choices?.[0]?.message?.content) {
            const cleanJsonText = completion.choices[0].message.content
              .replace(/```json/g, '')
              .replace(/```/g, '')
              .trim();
            const parsed: unknown = JSON.parse(cleanJsonText);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              const obj = parsed as Record<string, unknown>;
              aiResult = {
                title: typeof obj.title === 'string' ? obj.title : rawAudioText.slice(0, 100),
                description: typeof obj.description === 'string' ? obj.description : null,
                priority: typeof obj.priority === 'string' ? obj.priority : 'NORMAL',
                projectName: typeof obj.projectName === 'string' ? obj.projectName : null,
                assigneeEmail: typeof obj.assigneeEmail === 'string' ? obj.assigneeEmail : null,
                assigneeName: typeof obj.assigneeName === 'string' ? obj.assigneeName : null,
                dueDate: typeof obj.dueDate === 'string' ? obj.dueDate : null,
              };
              this.cachedModel = modelToTry;
              break;
            }
          }
        } catch {
          // Try next candidate model
        }
      }
    }

    if (!aiResult.title || aiResult.title === rawAudioText.slice(0, 100)) {
      aiResult = this.fallbackRuleBasedParser(rawAudioText, projects, users, now);
    }

    let targetProjectId = currentProjectId;
    if (aiResult.projectName) {
      const targetName = aiResult.projectName.toLowerCase();
      const foundProj = projects.find(
        (p) => p.name.toLowerCase().includes(targetName) || targetName.includes(p.name.toLowerCase())
      );
      if (foundProj) {
        targetProjectId = foundProj.id;
      }
    }
    if (!targetProjectId || !projects.some((p) => p.id === targetProjectId)) {
      targetProjectId = projects[0].id;
    }
    const matchedProjectName = projects.find((p) => p.id === targetProjectId)?.name || 'Dự án mặc định';

    let targetAssigneeId: string | null = null;
    if (aiResult.assigneeEmail) {
      const targetEmail = aiResult.assigneeEmail.toLowerCase();
      const foundUser = users.find((u) => u.email.toLowerCase() === targetEmail);
      if (foundUser) {
        targetAssigneeId = foundUser.id;
      }
    }

    if (!targetAssigneeId && (aiResult.assigneeName || aiResult.assigneeEmail)) {
      const queryName = (aiResult.assigneeName || aiResult.assigneeEmail || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();

      const foundUser = users.find((u) => {
        const uClean = u.fullName
          .replace(/\s*\([^)]*\)/g, '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/đ/g, 'd')
          .replace(/Đ/g, 'D')
          .toLowerCase()
          .trim();
        const uParts = uClean.split(/\s+/);
        const uFirst = uParts[uParts.length - 1];

        return (
          uClean === queryName ||
          uFirst === queryName ||
          uClean.includes(queryName) ||
          queryName.includes(uFirst) ||
          u.email.toLowerCase().includes(queryName)
        );
      });

      if (foundUser) {
        targetAssigneeId = foundUser.id;
      }
    }

    if (!targetAssigneeId) {
      targetAssigneeId = userId;
    }

    const assignedUser = users.find((u) => u.id === targetAssigneeId);

    const rawPriority = (aiResult.priority || 'NORMAL').toUpperCase();
    let priority: TaskPriority = TaskPriority.NORMAL;
    if (rawPriority === 'LOW') priority = TaskPriority.LOW;
    else if (rawPriority === 'IMPORTANT') priority = TaskPriority.IMPORTANT;
    else if (rawPriority === 'URGENT') priority = TaskPriority.URGENT;

    return {
      rawAudioText,
      parsedData: {
        title: aiResult.title || rawAudioText,
        description: aiResult.description || null,
        priority,
        projectId: targetProjectId,
        projectName: matchedProjectName,
        assigneeId: targetAssigneeId,
        assigneeName: assignedUser?.fullName || 'Chính bạn',
        assigneeEmail: assignedUser?.email || '',
        dueDate: aiResult.dueDate || null,
      },
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
      users: users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        avatar: u.avatar,
        profession: u.profession,
      })),
    };
  }

  /**
   * Boc bang file am thanh qua Whisper va phan tich du lieu cho man hinh xac nhan.
   */
  async parseVoiceAudio(
    userId: string,
    fileBuffer: Buffer,
    filename: string = 'voice-command.webm',
    currentProjectId?: string
  ): Promise<VoiceParseResponse> {
    const rawAudioText = await this.transcribeAudioFile(fileBuffer, filename);
    return await this.parseVoiceText(userId, rawAudioText, currentProjectId);
  }

  /**
   * Xac nhan va tao task vao co so du lieu sau khi nguoi dung kiem tra thong tin.
   */
  async confirmCreateTask(userId: string, payload: ConfirmVoiceTaskPayload): Promise<VoiceTaskCreationResponse> {
    const startTime = Date.now();

    const voiceLog = await this.prisma.voiceCommandLog.create({
      data: {
        userId,
        rawAudioText: payload.rawVoice || payload.title,
        status: VoiceLogStatus.PARSED,
      },
    });

    let parsedDueDate: Date | null = null;
    if (payload.dueDate) {
      const d = new Date(payload.dueDate);
      if (!isNaN(d.getTime())) {
        parsedDueDate = d;
      }
    }

    const priority = payload.priority || TaskPriority.NORMAL;
    const targetAssigneeId = payload.assigneeId || userId;

    const newTask = await this.prisma.task.create({
      data: {
        title: payload.title,
        description: payload.description || null,
        priority,
        dueDate: parsedDueDate,
        projectId: payload.projectId,
        assigneeId: targetAssigneeId,
        createdById: userId,
        rawVoice: payload.rawVoice || null,
        stageId: 'stage_1',
      },
      include: {
        project: { select: { id: true, name: true } },
        assignee: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatar: true,
            profession: true,
          },
        },
        createdBy: {
          select: { id: true, fullName: true, email: true, avatar: true },
        },
        tags: { include: { tag: true } },
        subtasks: {
          include: {
            assignee: { select: { id: true, fullName: true, avatar: true } },
          },
        },
        attachments: true,
      },
    });

    const processingTimeMs = Date.now() - startTime;

    await this.prisma.voiceCommandLog.update({
      where: { id: voiceLog.id },
      data: {
        intent: 'CREATE_TASK',
        parsedJson: JSON.stringify(payload),
        status: VoiceLogStatus.SUCCESS,
        processingTimeMs,
        projectId: payload.projectId,
        taskId: newTask.id,
      },
    });

    if (newTask.projectId) {
      this.socketGateway.broadcastToProject(newTask.projectId, 'task:created', newTask);
    }

    if (newTask.assigneeId && newTask.assigneeId !== userId) {
      await this.notificationService.sendNotification({
        userId: newTask.assigneeId,
        actorId: userId,
        title: 'Bạn được giao Task mới qua Giọng nói',
        content: `Bạn vừa được giao phụ trách Task "${newTask.title}" bằng lệnh giọng nói AI Solaris.`,
        type: 'TASK_ASSIGNED',
        taskId: newTask.id,
        projectId: newTask.projectId,
      });
    }

    return {
      success: true,
      message: 'Tạo công việc thành công bằng AI Voice!',
      task: newTask,
      parsedData: {
        title: newTask.title,
        description: newTask.description,
        priority: newTask.priority,
        projectName: newTask.project?.name,
        assigneeEmail: newTask.assignee?.email,
        assigneeName: newTask.assignee?.fullName,
        dueDate: payload.dueDate,
      },
    };
  }

  /**
   * Tu dong phat hien va chon lua model LLM hoat dong tot nhat tren Groq.
   */
  private async resolveGroqModel(groqClient: OpenAI): Promise<string> {
    if (this.cachedModel) {
      return this.cachedModel;
    }

    if (process.env.GROQ_MODEL) {
      this.cachedModel = process.env.GROQ_MODEL;
      return this.cachedModel;
    }

    try {
      const modelList = await groqClient.models.list();
      const availableIds = modelList.data.map((m) => m.id);

      const preferredOrder = [
        'openai/gpt-oss-120b',
        'llama-3.3-70b-versatile',
        'openai/gpt-oss-20b',
        'qwen/qwen3.8-27b',
        'allam-2-7b',
        'llama-3.1-8b-instant',
        'llama-3.1-70b-versatile',
        'llama3-70b-8192',
        'llama3-8b-8192',
        'mixtral-8x7b-32768',
        'gemma2-9b-it',
        'qwen-2.5-32b',
        'deepseek-r1-distill-llama-70b',
      ];

      for (const modelId of preferredOrder) {
        if (availableIds.includes(modelId)) {
          this.cachedModel = modelId;
          return modelId;
        }
      }

      const anyChatModel = availableIds.find(
        (id) =>
          id.includes('gpt-oss') ||
          id.includes('llama') ||
          id.includes('qwen') ||
          id.includes('allam') ||
          id.includes('mixtral') ||
          id.includes('gemma')
      );

      if (anyChatModel) {
        this.cachedModel = anyChatModel;
        return anyChatModel;
      }

      if (availableIds.length > 0 && availableIds[0]) {
        this.cachedModel = availableIds[0];
        return availableIds[0];
      }
    } catch (listErr: unknown) {
      const msg = listErr instanceof Error ? listErr.message : String(listErr);
      console.warn('Khong the tu dong truy van danh sach model Groq:', msg);
    }

    this.cachedModel = 'openai/gpt-oss-120b';
    return this.cachedModel;
  }

  /**
   * Bo phan tich du phong theo luat regex khi mang hoac LLM gap su co.
   */
  private fallbackRuleBasedParser(
    rawText: string,
    projects: ProjectSummary[],
    users: UserSummary[],
    today: Date
  ): AiTaskResult {
    const textLower = rawText.toLowerCase();

    const normalizeVietnamese = (str: string): string => {
      return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase();
    };

    const textNormalized = normalizeVietnamese(rawText);

    let priority = 'NORMAL';
    if (
      textLower.includes('khẩn cấp') ||
      textLower.includes('gấp') ||
      textLower.includes('ngay lập tức') ||
      textLower.includes('urgent') ||
      textLower.includes('emergency') ||
      textLower.includes('asap')
    ) {
      priority = 'URGENT';
    } else if (
      textLower.includes('quan trọng') ||
      textLower.includes('ưu tiên') ||
      textLower.includes('important') ||
      textLower.includes('high priority') ||
      textLower.includes('high')
    ) {
      priority = 'IMPORTANT';
    } else if (
      textLower.includes('thấp') ||
      textLower.includes('rảnh làm') ||
      textLower.includes('low priority') ||
      textLower.includes('low')
    ) {
      priority = 'LOW';
    }

    let matchedUser: UserSummary | null = null;
    let extractedAssigneeName: string | null = null;

    for (const u of users) {
      const cleanFullName = u.fullName.replace(/\s*\([^)]*\)/g, '').trim();
      const cleanNormalized = normalizeVietnamese(cleanFullName);
      const nameParts = cleanNormalized.split(/\s+/);
      const firstName = nameParts[nameParts.length - 1];

      const rxAssignee = new RegExp('(?:cho|giao cho|for|to|assign to)\\s+' + firstName + '\\b', 'i');
      const rxFullName = new RegExp('\\b' + cleanNormalized + '\\b', 'i');

      if (
        (firstName && rxAssignee.test(textNormalized)) ||
        rxFullName.test(textNormalized) ||
        textLower.includes(u.email.toLowerCase())
      ) {
        matchedUser = u;
        extractedAssigneeName = cleanFullName;
        break;
      }
    }

    if (!matchedUser) {
      const assigneeRegex = /(?:giao cho|cho|assign to|for|to)\s+([a-zA-Z0-9_\u00C0-\u1EF9]+)/i;
      const assigneeMatch = rawText.match(assigneeRegex);
      if (assigneeMatch && assigneeMatch[1]) {
        extractedAssigneeName = assigneeMatch[1];
      }
    }

    let matchedProject: ProjectSummary | null = null;
    for (const p of projects) {
      const pNameLower = p.name.toLowerCase();
      if (textLower.includes(pNameLower)) {
        matchedProject = p;
        break;
      }
    }

    let dueDateStr: string | null = null;
    const targetDate = new Date(today);

    if (textLower.includes('hôm nay') || textLower.includes('today')) {
      dueDateStr = targetDate.toISOString().split('T')[0];
    } else if (textLower.includes('ngày mai') || textLower.includes('tomorrow')) {
      targetDate.setDate(targetDate.getDate() + 1);
      dueDateStr = targetDate.toISOString().split('T')[0];
    } else if (
      textLower.includes('ngày kia') ||
      textLower.includes('hôm kia') ||
      textLower.includes('the day after tomorrow')
    ) {
      targetDate.setDate(targetDate.getDate() + 2);
      dueDateStr = targetDate.toISOString().split('T')[0];
    } else if (
      textLower.includes('tuần sau') ||
      textLower.includes('cuối tuần') ||
      textLower.includes('next week') ||
      textLower.includes('weekend')
    ) {
      targetDate.setDate(targetDate.getDate() + 7);
      dueDateStr = targetDate.toISOString().split('T')[0];
    }

    let cleanTitle = rawText
      .replace(
        /^(tạo task|tạo nhiệm vụ|tạo công việc|thêm việc|thêm task|tạo việc|tạo|create task|create new task|add task|make task|new task)\s+/i,
        ''
      )
      .replace(
        /(?:mức độ|độ ưu tiên|priority|level)\s+(?:khẩn cấp|gấp|ngay lập tức|urgent|emergency|asap|quan trọng|ưu tiên|important|high|thấp|rảnh làm|low)/gi,
        ''
      )
      .replace(
        /\b(?:mức độ\s+khẩn cấp|khẩn cấp|mức độ\s+quan trọng|quan trọng|mức độ\s+thấp|thấp|urgent|important|low)\b/gi,
        ''
      )
      .replace(
        /(?:deadline|hạn chót|hạn hoàn thành|hạn|due date|due)\s+(?:hôm nay|ngày mai|ngày kia|hôm kia|tuần sau|cuối tuần|today|tomorrow|the day after tomorrow|next week|weekend)/gi,
        ''
      )
      .replace(/\b(?:deadline|hạn chót|hạn)\b/gi, '')
      .replace(
        /\b(?:hôm nay|ngày mai|ngày kia|hôm kia|tuần sau|cuối tuần|today|tomorrow|the day after tomorrow|next week|weekend)\b/gi,
        ''
      )
      .replace(/(?:giao cho|cho|assign to|for|to)\s+[a-zA-Z0-9_\u00C0-\u1EF9]+/gi, '')
      .replace(/(?:trong dự án|thuộc dự án|dự án|in project|project)\s+[a-zA-Z0-9_\u00C0-\u1EF9]+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanTitle || cleanTitle.length < 2) {
      cleanTitle = rawText.replace(/^(tạo task|tạo nhiệm vụ|tạo công việc|create task)\s+/i, '').trim();
    }
    if (!cleanTitle) {
      cleanTitle = rawText.trim();
    }
    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);

    return {
      title: cleanTitle,
      description: null,
      priority,
      projectName: matchedProject?.name || null,
      assigneeEmail: matchedUser?.email || null,
      assigneeName: extractedAssigneeName,
      dueDate: dueDateStr,
    };
  }

  /**
   * Xu ly logic phan tich cau lenh bang Groq LLaMA va tao task moi vao co so du lieu.
   */
  async processVoiceTaskCreation(userId: string, rawAudioText: string): Promise<VoiceTaskCreationResponse> {
    const startTime = Date.now();

    const voiceLog = await this.prisma.voiceCommandLog.create({
      data: {
        userId,
        rawAudioText,
        status: VoiceLogStatus.PARSED,
      },
    });

    try {
      const groqClient = this.getGroqClient();

      const projects: ProjectSummary[] = await this.prisma.project.findMany({
        where: { isDeleted: false },
        select: { id: true, name: true },
      });

      const users: UserSummary[] = await this.prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, email: true, fullName: true },
      });

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const currentDayOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][
        now.getDay()
      ];

      const prompt = `
Bạn là trợ lý ảo AI thông minh đa ngôn ngữ Solaris AI, có khả năng hiểu sâu sắc khẩu lệnh Song ngữ (Tiếng Việt, Tiếng Anh và Vietglish/thuật ngữ kỹ thuật IT) của người dùng để trích xuất thông tin tạo Task (Công việc).

Thời điểm hiện tại: ${todayStr} (${currentDayOfWeek}).

Danh sách Dự án đang có trong hệ thống:
${JSON.stringify(projects.map((p) => ({ id: p.id, name: p.name })))}

Danh sách Thành viên đang có trong hệ thống:
${JSON.stringify(users.map((u) => ({ id: u.id, email: u.email, fullName: u.fullName })))}

Câu lệnh giọng nói của người dùng (có thể là Tiếng Việt, Tiếng Anh hoặc Song ngữ/Vietglish):
"${rawAudioText}"

Hãy phân tích kỹ câu lệnh và trả về JSON thuần túy (không kèm bất kỳ văn bản giải thích hoặc code block nào) với cấu trúc sau:
{
  "title": "Chỉ chứa nội dung/hành động chính của công việc (Ví dụ: 'Fix bug API Authentication', 'Thiết kế Banner Marketing', 'Tối ưu hiệu năng Database'). Tuyệt đối KHÔNG gộp các từ khóa 'cho Nam', 'mức độ khẩn cấp', 'deadline ngày mai' vào title.",
  "description": "Mô tả chi tiết nội dung công việc nếu người dùng có nói, hoặc null",
  "priority": "LOW" | "NORMAL" | "IMPORTANT" | "URGENT",
  "projectName": "Tên dự án trong danh sách khớp nhất với câu lệnh, hoặc null",
  "assigneeEmail": "Email của thành viên trong danh sách được nhắc đến (ví dụ: 'giao cho Nam', 'for Sarah', 'cho An'), hoặc null",
  "assigneeName": "Tên thành viên nếu có (ví dụ: 'Nam', 'Alex', 'Sarah'), hoặc null",
  "dueDate": "YYYY-MM-DD nếu có thời hạn (ví dụ: 'ngày mai'/'tomorrow' -> tính toán ngày tiếp theo từ hôm nay ${todayStr}, 'thứ hai tuần sau'/'next week', 'cuối tuần'/'weekend'), hoặc null"
}

Quy tắc phân loại priority:
- "khẩn cấp", "gấp", "ngay", "urgent", "emergency", "asap" -> "URGENT"
- "quan trọng", "ưu tiên", "important", "high priority", "high" -> "IMPORTANT"
- "thấp", "khi nào rảnh làm", "low priority", "low" -> "LOW"
- Các trường hợp khác -> "NORMAL"
      `.trim();

      let aiResult: AiTaskResult = {
        title: rawAudioText.slice(0, 100),
        priority: 'NORMAL',
      };

      if (groqClient) {
        const candidateModels = [
          await this.resolveGroqModel(groqClient),
          'llama-3.3-70b-versatile',
          'llama-3.1-8b-instant',
          'llama3-70b-8192',
          'llama3-8b-8192',
          'mixtral-8x7b-32768',
          'gemma2-9b-it',
        ];
        const uniqueCandidates = Array.from(new Set(candidateModels));

        let completion: OpenAI.Chat.Completions.ChatCompletion | null = null;
        let lastModelError: string | null = null;

        for (const modelToTry of uniqueCandidates) {
          try {
            completion = await groqClient.chat.completions.create({
              model: modelToTry,
              messages: [{ role: 'user', content: prompt }],
              response_format: { type: 'json_object' },
            });
            if (completion) {
              this.cachedModel = modelToTry;
              break;
            }
          } catch (modelErr: unknown) {
            lastModelError = modelErr instanceof Error ? modelErr.message : String(modelErr);
            console.warn(`Groq model ${modelToTry} failed: ${lastModelError}. Thử model tiếp theo...`);
          }
        }

        if (completion?.choices?.[0]?.message?.content) {
          const cleanJsonText = completion.choices[0].message.content
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

          try {
            const parsed: unknown = JSON.parse(cleanJsonText);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              const obj = parsed as Record<string, unknown>;
              aiResult = {
                title: typeof obj.title === 'string' ? obj.title : rawAudioText.slice(0, 100),
                description: typeof obj.description === 'string' ? obj.description : null,
                priority: typeof obj.priority === 'string' ? obj.priority : 'NORMAL',
                projectName: typeof obj.projectName === 'string' ? obj.projectName : null,
                assigneeEmail: typeof obj.assigneeEmail === 'string' ? obj.assigneeEmail : null,
                assigneeName: typeof obj.assigneeName === 'string' ? obj.assigneeName : null,
                dueDate: typeof obj.dueDate === 'string' ? obj.dueDate : null,
              };
            }
          } catch (parseErr: unknown) {
            const message = parseErr instanceof Error ? parseErr.message : String(parseErr);
            console.error('JSON parse error from Groq response:', cleanJsonText, message);
            aiResult = this.fallbackRuleBasedParser(rawAudioText, projects, users, now);
          }
        } else {
          console.warn('Tất cả Groq model đều không khả dụng, kích hoạt Smart Fallback Parser');
          aiResult = this.fallbackRuleBasedParser(rawAudioText, projects, users, now);
        }
      } else {
        console.warn('Chưa cấu hình GROQ_API_KEY, tự động chuyển sang Smart Fallback Parser');
        aiResult = this.fallbackRuleBasedParser(rawAudioText, projects, users, now);
      }

      let targetProjectId = projects[0]?.id;
      if (aiResult.projectName) {
        const targetName = aiResult.projectName.toLowerCase();
        const foundProj = projects.find(
          (p) => p.name.toLowerCase().includes(targetName) || targetName.includes(p.name.toLowerCase())
        );
        if (foundProj) {
          targetProjectId = foundProj.id;
        }
      }

      if (!targetProjectId) {
        throw new NotFoundException(
          'Hệ thống chưa có dự án nào. Vui lòng tạo ít nhất 1 dự án trước khi tạo task bằng giọng nói.'
        );
      }

      let targetAssigneeId: string | null = null;
      if (aiResult.assigneeEmail) {
        const targetEmail = aiResult.assigneeEmail.toLowerCase();
        const foundUser = users.find((u) => u.email.toLowerCase() === targetEmail);
        if (foundUser) {
          targetAssigneeId = foundUser.id;
        }
      }

      if (!targetAssigneeId && (aiResult.assigneeName || aiResult.assigneeEmail)) {
        const queryName = (aiResult.assigneeName || aiResult.assigneeEmail || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/đ/g, 'd')
          .replace(/Đ/g, 'D')
          .toLowerCase()
          .trim();

        const foundUser = users.find((u) => {
          const uClean = u.fullName
            .replace(/\s*\([^)]*\)/g, '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase()
            .trim();
          const uParts = uClean.split(/\s+/);
          const uFirst = uParts[uParts.length - 1];

          return (
            uClean === queryName ||
            uFirst === queryName ||
            uClean.includes(queryName) ||
            queryName.includes(uFirst) ||
            u.email.toLowerCase().includes(queryName)
          );
        });

        if (foundUser) {
          targetAssigneeId = foundUser.id;
        }
      }

      if (!targetAssigneeId) {
        targetAssigneeId = userId;
      }

      let parsedDueDate: Date | null = null;
      if (aiResult.dueDate) {
        const d = new Date(aiResult.dueDate);
        if (!isNaN(d.getTime())) {
          parsedDueDate = d;
        }
      }

      const rawPriority = (aiResult.priority || 'NORMAL').toUpperCase();
      let priority: TaskPriority = TaskPriority.NORMAL;
      if (rawPriority === 'LOW') {
        priority = TaskPriority.LOW;
      } else if (rawPriority === 'IMPORTANT') {
        priority = TaskPriority.IMPORTANT;
      } else if (rawPriority === 'URGENT') {
        priority = TaskPriority.URGENT;
      }

      const newTask = await this.prisma.task.create({
        data: {
          title: aiResult.title || rawAudioText,
          description: aiResult.description || null,
          priority,
          dueDate: parsedDueDate,
          projectId: targetProjectId,
          assigneeId: targetAssigneeId,
          createdById: userId,
          rawVoice: rawAudioText,
          stageId: 'stage_1',
        },
        include: {
          project: { select: { id: true, name: true } },
          assignee: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatar: true,
              profession: true,
            },
          },
          createdBy: {
            select: { id: true, fullName: true, email: true, avatar: true },
          },
          tags: { include: { tag: true } },
          subtasks: {
            include: {
              assignee: { select: { id: true, fullName: true, avatar: true } },
            },
          },
          attachments: true,
        },
      });

      const processingTimeMs = Date.now() - startTime;

      await this.prisma.voiceCommandLog.update({
        where: { id: voiceLog.id },
        data: {
          intent: 'CREATE_TASK',
          parsedJson: JSON.stringify(aiResult),
          status: VoiceLogStatus.SUCCESS,
          processingTimeMs,
          projectId: targetProjectId,
          taskId: newTask.id,
        },
      });

      if (newTask.projectId) {
        this.socketGateway.broadcastToProject(newTask.projectId, 'task:created', newTask);
      }

      if (newTask.assigneeId && newTask.assigneeId !== userId) {
        await this.notificationService.sendNotification({
          userId: newTask.assigneeId,
          actorId: userId,
          title: 'Bạn được giao Task mới qua Giọng nói',
          content: `Bạn vừa được giao phụ trách Task "${newTask.title}" bằng lệnh giọng nói AI Solaris.`,
          type: 'TASK_ASSIGNED',
          taskId: newTask.id,
          projectId: newTask.projectId,
        });
      }

      return {
        success: true,
        message: 'Tạo công việc thành công bằng AI Voice!',
        task: newTask,
        parsedData: aiResult,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const processingTimeMs = Date.now() - startTime;

      try {
        await this.prisma.voiceCommandLog.update({
          where: { id: voiceLog.id },
          data: {
            status: VoiceLogStatus.FAILED,
            errorMessage,
            processingTimeMs,
          },
        });
      } catch (logErr: unknown) {
        const message = logErr instanceof Error ? logErr.message : String(logErr);
        console.error('Error updating voiceCommandLog failure:', message);
      }

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(`Lỗi khi phân tích giọng nói qua Groq AI: ${errorMessage}`);
    }
  }
}
