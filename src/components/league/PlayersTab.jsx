import React from 'react';
import { Users, Plus, X, Check, Clock, CheckCircle, XCircle, AlertCircle, RotateCcw, BadgeCheck } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { UserSearchPicker } from '../UserSearchPicker';
import { DisplayNameEditor } from '../DisplayNameEditor';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '../shared/EmptyState';
import { PlayerLink } from './PlayerLink';
import { cn } from '@/lib/utils';

const initials = (name) => (name || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

export function PlayersTab({
  league, user, isManager, myMembership,
  showNameEditor, setShowNameEditor, myLeagueRegistration, registerLoading, registrationError,
  onSelfRegister, onWithdrawReg,
  leagueRegistrations, processingRegId, onApproveReg, onRejectReg,
  isAddingPlayer, setIsAddingPlayer, addMode, setAddMode, newPlayerName, setNewPlayerName,
  isAddingMember, onAddPlayer, onAddUserFromSearch,
  pendingMemberIds, onToggleActive, onRemovePlayer,
}) {
  const { t } = useLanguage();
  const pendingCount = leagueRegistrations.filter(r => r.status === 'pending').length;

  const errorAlert = registrationError && (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription>{registrationError}</AlertDescription>
    </Alert>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Player Self-Registration (non-managers) */}
      {user && !isManager && (
        <div className="flex flex-col gap-3">
          {myMembership ? (
            <Alert className="border-green-200 bg-green-100 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
              <CheckCircle />
              <AlertTitle>{t('leagues.youAreMember')}</AlertTitle>
            </Alert>
          ) : (
            <Card>
              <CardContent className="flex flex-col gap-3">
                {showNameEditor && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">{t('registration.nameRequiredHint')}</p>
                    <DisplayNameEditor
                      currentName=""
                      onSaved={(newName) => onSelfRegister(newName)}
                      onCancel={() => setShowNameEditor(false)}
                    />
                  </div>
                )}
                {/* No request yet, or an approved one whose membership was
                    since removed — either way the user can (re)apply. */}
                {(!myLeagueRegistration || myLeagueRegistration.status === 'approved') && !showNameEditor && (
                  <Button size="lg" className="w-fit" onClick={() => onSelfRegister()} disabled={registerLoading}>
                    <Plus />
                    {registerLoading ? t('common.loading') : t('leagues.joinLeague')}
                  </Button>
                )}
                {myLeagueRegistration?.status === 'pending' && (
                  <>
                    <Badge variant="outline" className="w-fit bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                      <Clock />
                      {t('leagues.registrationPending')}
                    </Badge>
                    <p className="text-sm text-muted-foreground">{t('leagues.registrationSubmitted')}</p>
                    <Button variant="outline" className="w-fit" onClick={onWithdrawReg} disabled={registerLoading}>
                      <X />
                      {t('registration.withdrawRegistration')}
                    </Button>
                  </>
                )}
                {myLeagueRegistration?.status === 'rejected' && (
                  <>
                    <Badge variant="outline" className="w-fit bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200">
                      <XCircle />
                      {t('leagues.registrationRejected')}
                    </Badge>
                    <p className="text-sm text-muted-foreground">{t('registration.registrationRejectedHint')}</p>
                    {!showNameEditor && (
                      <Button className="w-fit" onClick={() => onSelfRegister()} disabled={registerLoading}>
                        <RotateCcw />
                        {registerLoading ? t('common.loading') : t('leagues.applyAgain')}
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
          {errorAlert}
        </div>
      )}

      {/* Registration requests (managers) */}
      {isManager && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{t('leagues.pendingRequests')}</CardTitle>
              {pendingCount > 0 && (
                <Badge variant="secondary" className="tabular-nums">{pendingCount} {t('registration.statusPending')}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {errorAlert}
            {leagueRegistrations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('registration.noRequestsPending')}</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {leagueRegistrations.map(reg => (
                  <li key={reg.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{reg.player_name}</span>
                      <span className="text-xs text-muted-foreground">{new Date(reg.created_at).toLocaleDateString()}</span>
                    </div>
                    {reg.status === 'pending' ? (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => onApproveReg(reg.id)} disabled={processingRegId === reg.id}>
                          <CheckCircle /> {t('registration.approve')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onRejectReg(reg.id)} disabled={processingRegId === reg.id}>
                          <XCircle /> {t('registration.reject')}
                        </Button>
                      </div>
                    ) : (
                      <Badge
                        variant="outline"
                        className={reg.status === 'approved'
                          ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'}
                      >
                        {reg.status === 'approved' ? <CheckCircle /> : <XCircle />}
                        {reg.status === 'approved' ? t('registration.statusApproved') : t('registration.statusRejected')}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{t('leagues.players')}</h2>
        {isManager && !isAddingPlayer && (
          <Button onClick={() => setIsAddingPlayer(true)}>
            <Plus />
            {t('leagues.addPlayer')}
          </Button>
        )}
      </div>

      {isManager && isAddingPlayer && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle>{t('leagues.addPlayer')}</CardTitle>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('common.cancel')}
                onClick={() => {
                  setIsAddingPlayer(false);
                  setNewPlayerName('');
                  setAddMode('name');
                }}
              >
                <X />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={addMode} onValueChange={setAddMode} className="gap-4">
              <TabsList>
                <TabsTrigger value="name">{t('userSearch.addByName')}</TabsTrigger>
                <TabsTrigger value="users">{t('userSearch.addFromUsers')}</TabsTrigger>
              </TabsList>
              <TabsContent value="name" className="flex gap-2">
                <Input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder={t('leagues.playerName')}
                  onKeyPress={(e) => e.key === 'Enter' && onAddPlayer()}
                />
                <Button onClick={onAddPlayer} disabled={isAddingMember || !newPlayerName.trim()}>
                  <Check />
                  {t('common.add')}
                </Button>
              </TabsContent>
              <TabsContent value="users">
                <UserSearchPicker onSelect={onAddUserFromSearch} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {league.members && league.members.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {league.members.map(member => {
            const pending = pendingMemberIds.has(member.player?.id);
            return (
              <Card key={member.player?.id || member.id} className="flex-row items-center gap-3 px-4 py-3">
                <Avatar>
                  <AvatarFallback>{initials(member.player?.name)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <PlayerLink player={member.player} className={cn('truncate', !member.isActive && 'text-muted-foreground')} />
                  {member.player?.user_id && (
                    <Badge variant="outline" title={t('common.registeredAccount')} aria-label={t('common.registeredAccount')}>
                      <BadgeCheck />
                    </Badge>
                  )}
                  {member.role === 'manager' && <Badge variant="secondary">{t('leagues.manager')}</Badge>}
                </div>
                {isManager && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Label htmlFor={`member-active-${member.player?.id}`} className="cursor-pointer gap-2 text-sm text-muted-foreground">
                      <Switch
                        id={`member-active-${member.player?.id}`}
                        checked={member.isActive}
                        disabled={pending}
                        onCheckedChange={() => onToggleActive(member.player.id, member.isActive)}
                      />
                      {t('leagues.active')}
                    </Label>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => onRemovePlayer(member.player.id)}
                      disabled={pending}
                      title={t('leagues.removePlayer')}
                      aria-label={t('leagues.removePlayer')}
                    >
                      <X />
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={Users} title={t('leagues.noPlayersYet')} />
      )}
    </div>
  );
}
