-- A map converted by smak gmod-map, held in the game (smak gmod-probe map, on the server with the map loaded):
-- the world has its physics, each player start has a floor under it with room for a player, a bullet's trace down
-- there hits the world and reads a surfaceprop, and a crate dropped over a start comes to rest on the floor and
-- hits it, to the physics, as that surfaceprop (the PHYSCOLLIDE's materials, not only the textures').
-- Models the game cannot find (Half-Life: Source's pickups, when it is not mounted) are noted, not failed.
local world = game.GetWorld()
note("map " .. game.GetMap() .. ", " .. #ents.GetAll() .. " entities")
check(IsValid(world:GetPhysicsObject()), "the world has physics (the map's PHYSCOLLIDE)")

local starts = {}
for _, class in ipairs({ "info_player_start", "info_player_deathmatch", "info_player_combine", "info_player_rebel" }) do
  for _, e in ipairs(ents.FindByClass(class)) do starts[#starts + 1] = e end
end
if not check(#starts > 0, "the map has player starts (" .. #starts .. ")") then return done() end

local onlyWorld = function(e) return e:IsWorld() end
local floored, roomy, floors, floorProps, props, bad = 0, 0, {}, {}, {}, {}
for _, e in ipairs(starts) do
  local at = e:GetPos()
  -- 256 down: Half-Life's own maps have starts a player drops from (bounce's 200 over its floor)
  local down = util.TraceLine({ start = at + Vector(0, 0, 8), endpos = at - Vector(0, 0, 256), mask = MASK_PLAYERSOLID, filter = onlyWorld })
  if down.HitWorld then
    floored = floored + 1
    if at.z - down.HitPos.z > 64 then note(e:GetClass() .. " at " .. tostring(at) .. string.format(" is %.0f over its floor", at.z - down.HitPos.z)) end
    local name = util.GetSurfacePropName(down.SurfaceProps) or "?"
    floors[#floors + 1] = down.HitPos
    floorProps[#floors] = name
    props[name] = (props[name] or 0) + 1
    -- Source's player box stands on its origin: 32 wide, 72 tall
    local feet = down.HitPos + Vector(0, 0, 1)
    local box = util.TraceHull({ start = feet, endpos = feet, mins = Vector(-16, -16, 0), maxs = Vector(16, 16, 72), mask = MASK_PLAYERSOLID, filter = onlyWorld })
    if not box.StartSolid then roomy = roomy + 1 else bad[#bad + 1] = e:GetClass() .. " at " .. tostring(at) .. " (no room)" end
  else
    bad[#bad + 1] = e:GetClass() .. " at " .. tostring(at) .. " (no floor within 256)"
  end
end
check(floored == #starts, "every start has a floor under it (" .. floored .. " of " .. #starts .. ")")
check(roomy == floored, "a player fits standing on each (" .. roomy .. " of " .. floored .. ")")
for i = 1, math.min(#bad, 5) do note(bad[i]) end
local said = {}
for name, n in pairs(props) do said[#said + 1] = name .. " " .. n end
table.sort(said)
note("the floors' surfaceprops: " .. table.concat(said, ", "))
check(props["default"] == nil or props["default"] < floored, "the floors read surfaceprops of their own, not all default")

local missing, seen = {}, {}
for _, e in ipairs(ents.GetAll()) do
  local model = e:GetModel()
  if isstring(model) and model:sub(-4):lower() == ".mdl" and not util.IsValidModel(model) and not seen[model] then
    seen[model] = true
    missing[#missing + 1] = model
  end
end
if #missing > 0 then note(#missing .. " models the game lacks (drawn as ERROR): " .. table.concat(missing, ", ", 1, math.min(#missing, 6))) end

if #floors == 0 then return done() end
-- the start furthest from every player, so the crate falls on the floor and not on someone
local floor, floorProp, far = floors[1], floorProps[1], -1
for i, f in ipairs(floors) do
  local near = math.huge
  for _, p in ipairs(player.GetAll()) do near = math.min(near, p:GetPos():Distance(f)) end
  if near > far then floor, floorProp, far = f, floorProps[i], near end
end
local crate = ents.Create("prop_physics")
crate:SetModel("models/props_junk/wood_crate001a.mdl")
crate:SetPos(floor + Vector(0, 0, 96))
crate:Spawn()
local phys = crate:GetPhysicsObject()
if not check(IsValid(phys), "a crate is made with physics") then crate:Remove() return done() end
phys:Wake()
-- what the physics says the world is where the crate hits it
local hits = {}
crate:AddCallback("PhysicsCollide", function(_, data)
  if data.HitEntity ~= world then return end
  local name = util.GetSurfacePropName(data.TheirSurfaceProps) or "?"
  hits[name] = (hits[name] or 0) + 1
end)
timer.Simple(4, function()
  if not IsValid(crate) then check(false, "the crate is still there 4 s later") return done() end
  local rest = crate:WorldSpaceAABB()
  local speed = crate:GetVelocity():Length()
  check(rest.z > floor.z - 4 and rest.z < floor.z + 24 and speed < 5,
    string.format("a crate dropped 96 over a start rests on its floor (its bottom %.1f over it, moving %.1f)", rest.z - floor.z, speed))
  local heard = {}
  for name, n in pairs(hits) do heard[#heard + 1] = name .. " " .. n end
  table.sort(heard)
  check(hits[floorProp] ~= nil, "the crate hits the floor, to the physics, as its own " .. floorProp .. " (hit as: " .. (#heard > 0 and table.concat(heard, ", ") or "nothing") .. ")")
  crate:Remove()
  done()
end)
