import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useStream } from "../hooks/use-stream";
import { Markdown } from "../components/markdown";
import { useQueryClient } from "@tanstack/react-query";
import { getGetClassroomHistoryQueryKey, saveClassroomHistoryItem } from "../lib/api-client";
import { useAuth } from "../lib/auth-context";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../components/ui/form";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { FileText, Loader2 } from "lucide-react";

const formSchema = z.object({
  topic: z.string().min(2, "Topic is required"),
  subject: z.string().min(2, "Subject is required"),
  gradeLevel: z.string().min(1, "Grade level is required"),
  assignmentType: z.string().min(1, "Assignment type is required"),
});

export function Assignment() {
  const { content, isStreaming, startStream } = useStream();
  const [hasGenerated, setHasGenerated] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      topic: "",
      subject: "",
      gradeLevel: "freshman",
      assignmentType: "essay",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setHasGenerated(true);
    const generated = await startStream("/api/classroom/assignment", values);

    if (generated) {
      await saveClassroomHistoryItem(user?.id || "", {
        type: "assignment",
        topic: values.topic,
        subject: values.subject,
        title: `${values.topic} (${values.assignmentType})`,
        content: generated,
      });
      queryClient.invalidateQueries({ queryKey: getGetClassroomHistoryQueryKey(user?.id) });
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-serif font-bold text-foreground">Assignment Creator</h1>
        <p className="text-muted-foreground mt-2">Draft comprehensive assignments tailored to your specific subject and grade.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <Card className="p-6 lg:col-span-1 border-paper-line/50 sticky top-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="topic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Topic</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. World War II Causes" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. History" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gradeLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grade Level</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="freshman">Freshman (1st Year)</SelectItem>
                        <SelectItem value="sophomore">Sophomore (2nd Year)</SelectItem>
                        <SelectItem value="junior">Junior (3rd Year)</SelectItem>
                        <SelectItem value="senior">Senior (4th Year)</SelectItem>
                        <SelectItem value="graduate">Graduate Level</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="assignmentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignment Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="essay">Essay Prompt</SelectItem>
                        <SelectItem value="project">Project Brief</SelectItem>
                        <SelectItem value="problem-set">Problem Set</SelectItem>
                        <SelectItem value="lab-report">Lab Report</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isStreaming}>
                {isStreaming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Drafting Assignment...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Draft Assignment
                  </>
                )}
              </Button>
            </form>
          </Form>
        </Card>

        <div className="lg:col-span-2">
          {hasGenerated ? (
            <Card className="p-8 min-h-[500px] border-paper-line/50 bg-paper">
              {content ? (
                <div className="animate-in fade-in duration-300">
                  <Markdown content={content} />
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 pt-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
                  <p>Formatting academic assignment...</p>
                </div>
              )}
            </Card>
          ) : (
            <div className="h-full min-h-[500px] border-2 border-dashed border-paper-line/50 rounded-xl flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
              <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p>Configure your assignment details to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}