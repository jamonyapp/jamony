-- 1105 用户画像: 性别唤醒+生日新列(欢哥定稿: 选填/生日仅本人可见/性别非保密才外显)
-- gender 列建表遗留(种子号 male/female 1117 行, 真用户全空); 值域 male|female|secret|NULL(未填)
ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday DATE;

-- admin 角色对 users 是列级授权(排除 password_hash): 新列必须补 GRANT, 否则又一静默权限坑(sms_codes 判例)
GRANT SELECT (gender, birthday) ON users TO jamony_admin;

-- 隐私政策 1.0.1: 2.2 资料清单补披露「性别、生日」(1104 政策 1.0.0 同日修订, 生效即日)
INSERT INTO agreements (id, type, version, effective_date, content)
SELECT 1105000000000001, 'privacy', '1.0.1', DATE '2026-11-05',
  replace(
    replace(content,
      '**版本：1.0.0 | 生效日期：2026年11月2日**',
      '**版本：1.0.1 | 生效日期：2026年11月5日**'),
    '你主动填写或修改的昵称、头像、签名、城市、乐器、风格偏好等资料信息，用于展示你的个人主页与匹配同好。',
    '你主动填写或修改的昵称、头像、签名、性别、生日、城市、乐器、风格偏好等资料信息，用于展示你的个人主页与匹配同好。其中生日信息仅你自己可见，不会向其他用户展示，用于账号与运营统计目的。')
FROM agreements
WHERE type = 'privacy' AND version = '1.0.0'
  AND NOT EXISTS (SELECT 1 FROM agreements WHERE type = 'privacy' AND version = '1.0.1');
