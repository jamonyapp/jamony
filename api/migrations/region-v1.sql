-- 1105 地区改造(城市→地区): 两级结构「广东省 深圳市」完整串
-- ① users.city varchar(50)→(100): 最长组合「新疆维吾尔自治区 克孜勒苏柯尔克孜自治州」22字
ALTER TABLE users ALTER COLUMN city TYPE varchar(100);

-- ② 存量清空(欢哥拍板 1105: 不做旧版兼容——除 rainbowtube 外全是假号, 朋友号公测前重注册,
--    旧50城enum值无迁移意义; rainbowtube 欢哥自己设置页重选10秒)
UPDATE users SET city = NULL WHERE city IS NOT NULL AND city <> '';
