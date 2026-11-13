import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'

// The SDK types are schema-driven; this project has no generated schema, so rows are validated at the store boundary.

const publicConfig = {
  resourceId: 'wbcs_4fj6BQttcpwaDhPHLoZQcM',
  endpoint: 'https://bill-insight-70667.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_0b8wM1zuhps166kDS9Wr0P_rO53jVcmhntfXZK4aZU9kFSyVifS7BPQ',
}

export const cloud = createWorkBuddyCloud<any>({
  endpoint: publicConfig.endpoint,
  oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
  publishableKey: publicConfig.publishableKey,
})
