import { JobSubTaskType, JobType } from '@prisma/client';

export type SubTaskInput = {
  taskType: JobSubTaskType;
  description: string;
  price?: number | null;
};

export function mapJobTypeToSubTaskType(jobType?: JobType | string): JobSubTaskType {
  const map: Record<string, JobSubTaskType> = {
    PAINTING: 'PAINTING',
    MECHANICAL: 'MECHANICAL',
    ELECTRICAL: 'ELECTRICAL',
    PANEL_BEATING: 'PANEL_BEATING',
    INSTALLATIONS: 'INSTALLATION',
    TYRES: 'TYRES',
    BODY_WORK: 'BODY_WORK',
    OTHER: 'OTHER',
  };
  return map[jobType || 'OTHER'] || 'OTHER';
}

export function sumSubTaskPrices(subTasks: SubTaskInput[]): number | undefined {
  if (!subTasks.length) return undefined;
  const total = subTasks.reduce((sum, task) => sum + (task.price ?? 0), 0);
  return total > 0 ? total : undefined;
}
