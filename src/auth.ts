import { PrismaClient, User } from '@prisma/client'
import { JwtPayload, verify } from 'jsonwebtoken'
 
export const APP_SECRET = 'this is my secret'
 
export async function authenticateUser(
  prisma: PrismaClient,
  request: Request
): Promise<User | null> {
  const header = request.headers.get('authorization')
  if (header !== null) {
    // Split authorization pour retirer le "bearer"
    const token = header.split(' ')[1]
    // vérification du token
    const tokenPayload = verify(token, APP_SECRET) as JwtPayload
    // user du token valide
    const userId = tokenPayload.userId
    // retourne le user via son ID
    return await prisma.user.findUnique({ where: { id: userId } })
  }
 
  return null
}