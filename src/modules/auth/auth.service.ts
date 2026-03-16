import { prisma } from '../../lib/prisma';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export async function registerUser(input: RegisterInput) {
  const data = registerSchema.parse(input);
  const passwordHash = await bcrypt.hash(data.password, 10);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: passwordHash,
      name: data.name,
    },
  });

  return user;
}

export async function loginUser(input: LoginInput) {
  const data = loginSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user) throw Object.assign(new Error('Invalid email or password'), { status: 401 });

  const ok = await bcrypt.compare(data.password, user.password);
  if (!ok) throw Object.assign(new Error('Invalid email or password'), { status: 401 });

  return { id: user.id, email: user.email, name: user.name };
}

