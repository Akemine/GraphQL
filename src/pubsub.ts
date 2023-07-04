import { createPubSub } from 'graphql-yoga'
import { Link, Vote } from '@prisma/client'
 
export type PubSubChannels = {
  newLink: [{ newLink: Link }]
  newVote: [{ newVote: Vote }]
}
 
export const pubSub = createPubSub<PubSubChannels>()