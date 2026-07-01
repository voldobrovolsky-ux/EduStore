/**
 * Communitoria (comm/) — контракты графа контактов и инвариантов безопасности миноров.
 * Несущие принципы: полная аудируемость (нет исчезающих сообщений / секретных чатов), контур comm/
 * изолирован от Документохранилища. События каналов/сообщений/звонков — в следующих чанках; здесь —
 * фундамент безопасности (граф + инварианты), проверяемый e2e ПЕРВЫМ.
 */
export const PARTICIPANT_ROLES = ['teacher', 'parent', 'staff', 'observer', 'external', 'student'] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

/** Принципал канала/DM: ВЗРОСЛЫЙ (userId=florus_user_id) ЛИБО МИНОР (studentId=Student.id). */
export interface Principal {
  userId?: string;
  studentId?: string;
}

/** Коды инвариантов миноров (бросаются как ForbiddenException — аудируемо). */
export const COMM_ERRORS = {
  /** приватный DM взрослый↔минор без ребра parenthood */
  minorDmRequiresParenthood: 'MINOR_DM_REQUIRES_PARENTHOOD',
  /** приватный DM минор↔минор (безопасный дефолт: миноры — в аудируемых каналах) */
  minorMinorDmForbidden: 'MINOR_MINOR_DM_FORBIDDEN',
  /** канал с участником-минором не принимает участника role=external */
  minorChannelNoExternal: 'MINOR_CHANNEL_NO_EXTERNAL',
} as const;
