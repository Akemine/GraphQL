import { APP_SECRET } from '../auth'
import { hash, compare } from 'bcryptjs'
import { sign } from 'jsonwebtoken'

// Import pour lire le schema
import { readFileSync } from 'fs';
const typeDefs = readFileSync('src\\schema\\schema.graphql', { encoding: 'utf-8' });

// Import fonction Prisma & GraphQL
import { makeExecutableSchema } from '@graphql-tools/schema'
import type { GraphQLContext } from '../context'
import type { Link, Comment, User, Vote, Prisma } from '@prisma/client'

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
      args: {filterNeedle?: string; skip?: number; take?: number, orderBy?: { description?: Prisma.SortOrder, url?: Prisma.SortOrder, createdAt?: Prisma.SortOrder}}, 
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
          take,
          orderBy: args.orderBy
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
    },
    me(parent: unknown, args: {}, context: GraphQLContext) {
      if (context.currentUser === null) {
        throw new Error('Unauthenticated!')
      }
 
      return context.currentUser
    },
    getUser(parent: unknown, args: {id: string}, context: GraphQLContext) {
      if (context.currentUser === null) {
        throw new Error('Unauthenticated!')
      }

      return context.prisma.user.findUnique({where: {id: parseInt(args.id)}})
    },

  },
  User: {
    links: (parent: User, args: {}, context: GraphQLContext) =>
      context.prisma.user.findUnique({ where: { id: parent.id } }).links()
  },
  Link: {
    id: (parent: Link) => parent.id,
    description: (parent: Link) => parent.description,
    url: (parent: Link) => parent.url,
    postedBy(parent: Link, args: {}, context: GraphQLContext) {
      if (!parent.postedById) {
        return null
      }
 
      return context.prisma.link
        .findUnique({ where: { id: parent.id } })
        .postedBy()
    },
    votes(parent: Link, args: {}, context:GraphQLContext) {
      return context.prisma.link.findUnique({where: {id : parent.id}}).votes()
    }
  },
  Vote: {
    id: (parent: Vote) => parent.id,
    link(parent: Link, args: {}, context: GraphQLContext) {
      return context.prisma.vote
        .findUnique({ where: { id: parent.id } }).link()
    },
    user(parent: Link, args: {}, context:GraphQLContext) {
      return context.prisma.vote.findUnique({where: {id : parent.id}}).user()
    }
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
    async login(
      parent: unknown,
      args: { email: string; password: string },
      context: GraphQLContext
    ) {
      // 1
      const user = await context.prisma.user.findUnique({
        where: { email: args.email }
      })
      if (!user) {
        throw new Error('No such user found')
      }
 
      // 2
      const valid = await compare(args.password, user.password)
      if (!valid) {
        throw new Error('Invalid password')
      }
 
      const token = sign({ userId: user.id }, APP_SECRET)
 
      // 3
      return { token, user }
    },
    async signup(
      parent: unknown,
      args: { email: string; password: string; name: string },
      context: GraphQLContext
    ) {
      // 1
      const password = await hash(args.password, 10)
 
      // 2
      const user = await context.prisma.user.create({
        data: { ...args, password }
      })
 
      // 3
      const token = sign({ userId: user.id }, APP_SECRET)
 
      // 4
      return { token, user }
    },
    async postLink(
      parent: unknown,
      args: { url: string; description: string },
      context: GraphQLContext
    ) {
      if (context.currentUser === null) {
        throw new GraphQLError('Unauthenticated!')
      }
 
      const newLink = await context.prisma.link.create({
        data: {
          url: args.url,
          description: args.description,
          postedBy: { connect: { id: context.currentUser.id } }
        }
      })
 
      context.pubSub.publish('newLink', { newLink })
 
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
    },
    async vote(
      parent: unknown,
      args: { linkId: string },
      context: GraphQLContext
    ) {
      if (!context.currentUser) {
        throw new GraphQLError('You must login in order to use upvote!')
      }
      
      const userId = context.currentUser.id
      const linkId = parseInt(args.linkId)

      const voteExist = await context.prisma.vote.findUnique({ where: {
        linkId_userId: {
          linkId: linkId,
          userId: userId
        }}
      })
      if (voteExist !== null) {
        throw new Error(`Already voted for link: ${args.linkId}`)
      }
      const newVote = await context.prisma.vote.create({
        data: {
          linkId: linkId,
          userId: userId
        }
      })
      
      context.pubSub.publish('newVote', { newVote })

      return newVote
    }
  },
  Subscription: {
    newLink: {
      subscribe: (parent: unknown, args: {}, context: GraphQLContext) =>
        context.pubSub.subscribe('newLink')
    },
    newVote: {
      subscribe: (parent: unknown, args: {}, context: GraphQLContext) =>
        context.pubSub.subscribe('newVote')
    }
  }
}
 
export const schema = makeExecutableSchema({
  resolvers: [resolvers],
  typeDefs: [typeDefs]
})