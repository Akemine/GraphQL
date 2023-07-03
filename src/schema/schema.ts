// Import pour lire le schema
import { readFileSync } from 'fs';
const typeDefs = readFileSync('src\\schema\\schema.graphql', { encoding: 'utf-8' });

// Import fonction Prisma & GraphQL
import { makeExecutableSchema } from '@graphql-tools/schema'
import type { GraphQLContext } from '../context'
import type { Link } from '@prisma/client'
import type { Comment } from '@prisma/client'

// Import de la gestion d'erreur
import { GraphQLError } from 'graphql'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

// Fonction qui vérifie via un REGEX que l'id comporte bien des int
const parseIntSafe = (value: string): number | null => {
  if (/^(\d+)$/.test(value)) {
    return parseInt(value, 10)
  }
  return null
}

// Function qui ajoute une contrainte pour ne pas envoyer un nombre trop énorme de réponse à la requête
const applyTakeConstraints = (params: {
  min: number
  max: number
  value: number
}) => {
  if (params.value < params.min || params.value > params.max) {
    throw new GraphQLError(
      `'take' argument value '${params.value}' is outside the valid range of '${params.min}' to '${params.max}'.`
    )
  }
  return params.value
}

const resolvers = {
  Query: {
    allLink: async (
      parent: unknown,
      args: {filterNeedle?: string; skip?: number; take?: number}, 
      context: GraphQLContext
      ) => {
        const where = args.filterNeedle
        ? {
            OR: [
              { description: { contains: args.filterNeedle } },
              { url: { contains: args.filterNeedle } }
            ]
          }
        : {}
        const take = applyTakeConstraints({
          min: 1,
          max: 50,
          value: args.take ?? 30 // Default Value
        })
        return context.prisma.link.findMany({
          where,
          skip: args.skip,
          take
        })
    },
    uniqueLink: async (
      parent: unknown,
      args:{id: string},
      context: GraphQLContext
      ) => {
        return context.prisma.link.findUnique({where: {id: parseInt(args.id)}})
    },
    allComment: async (
      parent: unknown,
      args: {id: string}, 
      context: GraphQLContext
      ) => {
        return context.prisma.comment.findMany()
    },
    uniqueComment: async (
      parent: unknown,
      args: {id: string},
      context: GraphQLContext
    ) => {
      return context.prisma.comment.findUnique({
        where: { id: parseInt(args.id) }
      })
    }

  },
  Link: {
    id: (parent: Link) => parent.id,
    description: (parent: Link) => parent.description,
    url: (parent: Link) => parent.url,
    comments: (parent: Link, args:{}, context: GraphQLContext)=> {
      return context.prisma.comment.findMany({where: {linkId: parent.id}})
    },
  },
  Comment: {
    id: (parent: Comment) => parent.id,
    body: (parent: Comment) => parent.body,
    linkId: (parent: Comment) => parent.linkId,
    links: (parent: Comment, args:{}, context: GraphQLContext)=> {
      return context.prisma.link.findMany({where: {id: parent.id}})
    },
  },
  Mutation: {
    async postLink(
      parent: unknown,
      args: { description: string; url: string },
      context: GraphQLContext
    ) {
      const newLink = await context.prisma.link.create({
        data: {
          url: args.url,
          description: args.description
        }
      })
      return newLink
    },
    async postCommentOnLink(
      parent: unknown,
      args: { linkId: string; body: string },
      context: GraphQLContext
    ) {
      const linkId = parseIntSafe(args.linkId) // On vérfie via un REGEX la validation de l'id reçu
      if (linkId === null) {
        return Promise.reject(
          new GraphQLError(
            `Cannot post comment on non-existing link with id '${args.linkId}'.`
          )
        )
      }
      const newComment = await context.prisma.comment.create({
        data: {
          linkId: parseInt(args.linkId),
          body: args.body,
        }
      })
      .catch((err: unknown) => {
        if (
          err instanceof PrismaClientKnownRequestError &&
          err.code === 'P2003' // Erreur de Foreign Key constraint qui n'existe pas
        ) {
          return Promise.reject(
            new GraphQLError(
              `Cannot post comment on non-existing link with id '${args.linkId}'.`
            )
          )
        }
        return Promise.reject(err)
      })
      return newComment
    }
  }
}
 
export const schema = makeExecutableSchema({
  resolvers: [resolvers],
  typeDefs: [typeDefs]
})