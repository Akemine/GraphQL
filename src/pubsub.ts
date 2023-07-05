import { createPubSub } from 'graphql-yoga'
import { Link, Vote } from '@prisma/client'
 
// On ajoute ici les différents subscription pour effectuer des trigger pendant ces events
export type PubSubChannels = {
  newLink: [{ newLink: Link }]
  newVote: [{ newVote: Vote }]
}
 
export const pubSub = createPubSub<PubSubChannels>()