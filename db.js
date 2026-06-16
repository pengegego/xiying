/**
 * Supabase 客户端
 * 使用 service_role key 通过 REST API 操作数据库
 */
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://txbrwudmvhrgfrsvaibc.supabase.co';
const SUPA_KEY = process.env.SUPA_KEY || 'eyJhbG...jUTw';

const supabase = createClient(SUPA_URL, SUPA_KEY);

module.exports = { supabase };
