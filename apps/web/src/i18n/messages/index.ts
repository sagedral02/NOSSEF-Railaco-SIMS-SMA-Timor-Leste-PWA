import { academic } from './academic';
import { admin } from './admin';
import { admissions } from './admissions';
import { core } from './core';
import { errors } from './errors';
import { finance } from './finance';
import { studentlife } from './studentlife';
import { resources } from './resources';
import { portal } from './portal';
import { insights } from './insights';
import { grades } from './grades';
import { operations } from './operations';

export const messages = { ...core, ...errors, ...admin, ...academic, ...admissions, ...operations, ...grades, ...finance, ...studentlife, ...resources, ...portal, ...insights };
export type MessageKey = keyof typeof messages;
